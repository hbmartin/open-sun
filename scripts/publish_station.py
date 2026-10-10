#!/usr/bin/env python3
"""Render the open-sun station documents from the ambientweather2sqlite database.

Writes ``current.json``, ``daily.json`` and ``hourly.json`` into an output
directory. ``publish_forecast.py`` then folds those files into the same
unparented commit it force-pushes to the ``data`` branch, so open-sun can read
station history from raw.githubusercontent instead of ``localhost:8080``.

Why this exists: the station is a LAN device behind ``aw2sqlite`` on this Mac,
so Vercel has no network path to it at build time or at request time. Since
``app/page.tsx`` prerenders ``/``, every deployment since ISR landed has failed
with ECONNREFUSED. Pushing the data to a public URL is the same trick that
already works for ``forecast.json``, and it needs no tunnel, no inbound port and
no always-on exposure of a home service.

Why it reads the database rather than the HTTP API it replaces: ``aw2sqlite
serve`` only starts its JSON server when ``--port`` (or a ``port`` key in the
config) is set, and it is not set here -- nothing has listened on 8080 for some
time. Reading the database also drops the dependency on the station device being
reachable at publish time; the collector writes every 60s, so the newest row is
at most a minute old.

Weather aggregation is delegated to ``ambientweather2sqlite``'s own query
functions. Accumulated rainfall is added from event-counter increments in
station-local days/hours; averaging a rain rate cannot produce a rain total.
That is why this script must run under the
aw2sqlite project (``uv run --project .../ambientweather2sqlite``) while
``publish_forecast.py`` stays stdlib-only.

The consumers are ``lib/schemas.ts`` (``CurrentWeatherApiResponseSchema``,
``DailyApiResponseSchema``, ``HourlyApiResponseSchema``) and ``lib/mappers.ts``
on ``main``; this script and those must change together.

Exit codes:
    0  documents written
    2  refused: the database is missing, empty, or would yield a document the
       consumer rejects (nothing is written, so the last good publish keeps
       serving)
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
from collections.abc import Iterable
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

PUBLISHER_VERSION = "1.1.0"

DEFAULT_DB = str(Path.home() / "Downloads/ambientweather2sqlite/aw2sqlite.db")
DEFAULT_PRIOR_DAYS = 7

# lib/utils.ts hardcodes this zone for all hour and day bucketing, so the
# published rows must be grouped by the same one or every reading lands in the
# wrong slot silently.
STATION_TIME_ZONE = "America/Los_Angeles"

# Exactly the 17 aggregates DailyApiResponseSchema and HourlyApiResponseSchema
# require. They are all non-nullable there, so a row missing any of them is not
# publishable -- see _usable_row.
AGGREGATION_FIELDS = [
    "min_outTemp",
    "avg_outTemp",
    "max_outTemp",
    "min_outHumi",
    "avg_outHumi",
    "max_outHumi",
    "max_gustspeed",
    "min_avgwind",
    "max_avgwind",
    "avg_avgwind",
    "avg_rainofhourly",
    "min_uvi",
    "avg_uvi",
    "max_uvi",
    "min_solarrad",
    "avg_solarrad",
    "max_solarrad",
]

# CurrentWeatherApiResponseSchema splits its fields this way: the indoor console
# and air-quality sensors are optional hardware, the outdoor ones are not.
REQUIRED_CURRENT_FIELDS = (
    "outTemp",
    "outHumi",
    "windir",
    "avgwind",
    "gustspeed",
    "dailygust",
    "solarrad",
    "uv",
    "uvi",
    "rainofhourly",
    "eventrain",
)
NULLABLE_CURRENT_FIELDS = ("inTemp", "inHumi", "AbsPress", "RelPress", "pm25")

# Averages arrive with full float noise (17 significant digits). Every display
# path rounds far harder than this -- RangedBar formats to at most 2 decimals
# and rain totals display hundredths -- so 4 decimals is display-lossless while
# keeping hourly.json roughly a third smaller.
PRECISION = 4


class RefusedError(Exception):
    """The database would yield a document the consumer rejects."""


# Diagnostics go to stdout so launchd files them under grounded-predict.log
# rather than the error log, where routine success would look like a fault.
# Under --print stdout is the payload channel, so they move aside.
_log_stream = sys.stdout


def _log(message: str) -> None:
    print(message, file=_log_stream, flush=True)


def _import_library() -> tuple[Any, Any, Any]:
    """Import aw2sqlite's query functions, or explain why we cannot."""
    # Unresolvable from open-sun's own environment by design: this file is the
    # reviewed source of truth living next to its consumer, but it executes
    # under the aw2sqlite project. The ImportError path below is the real guard.
    try:
        from ambientweather2sqlite.database import (  # pyright: ignore[reportMissingImports]
            query_daily_aggregated_data,
            query_hourly_aggregated_data,
        )
        from ambientweather2sqlite.database.metrics import (  # pyright: ignore[reportMissingImports]
            query_latest_observation,
        )
    except ImportError as exc:  # pragma: no cover - environment wiring
        msg = (
            f"cannot import ambientweather2sqlite ({exc}); run this under "
            f"`uv run --project /Volumes/ExtStor/weather/ambientweather2sqlite python ...`"
        )
        raise RefusedError(msg) from exc
    return (
        query_latest_observation,
        query_daily_aggregated_data,
        query_hourly_aggregated_data,
    )


def _round(value: Any) -> Any:
    """Round floats for the wire; leave everything else for the caller to judge."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return value
    if not math.isfinite(value):
        # Non-finite cannot be serialised as JSON, and a bare NaN would make the
        # whole document unparseable client-side. Treat it as absent instead.
        return None
    rounded = round(float(value), PRECISION)
    # -0.0 renders as "-0" and reads as a bug in the UI.
    return 0.0 if rounded == 0 else rounded


def _usable_row(row: dict[str, Any]) -> bool:
    """True when every field the consumer declares non-nullable survives the wire.

    Checking finiteness rather than mere presence matters: NaN is not None, so a
    presence check would admit it, and _round then writes it as a null that the
    schema rejects for exactly these fields.
    """
    for field in AGGREGATION_FIELDS:
        value = row.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        if not math.isfinite(value):
            return False
    return True


def _clean_row(row: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {key: _round(row[key]) for key in keys if key in row}


# --------------------------------------------------------------------------
# Documents
# --------------------------------------------------------------------------


def build_current(observation: dict[str, Any] | None) -> dict[str, Any]:
    """The newest stored observation, shaped like the live ``/`` endpoint."""
    if not observation:
        msg = "no observations in the database"
        raise RefusedError(msg)

    data: dict[str, Any] = {}
    for field in REQUIRED_CURRENT_FIELDS:
        value = _round(observation.get(field))
        if value is None:
            msg = f"newest observation has no {field}, which the consumer requires"
            raise RefusedError(msg)
        data[field] = value
    for field in NULLABLE_CURRENT_FIELDS:
        data[field] = _round(observation.get(field))

    return {
        "data": data,
        "metadata": {
            "observed_at": observation.get("ts"),
            "publisher_version": PUBLISHER_VERSION,
        },
    }


def build_daily(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Daily weather aggregates, oldest first; rain totals are added separately."""
    keys = ("date", *AGGREGATION_FIELDS)
    usable = [
        _clean_row(row, keys) for row in rows if row.get("date") and _usable_row(row)
    ]

    dropped = len(rows) - len(usable)
    if dropped:
        _log(f"daily: dropped {dropped} incomplete row(s)")
    if not usable:
        # app/page.tsx throws "No data" on an empty daily array, so publishing
        # one would break the page that a stale publish keeps working.
        msg = "no complete daily rows"
        raise RefusedError(msg)

    return {"data": usable}


def build_hourly(data: dict[str, list[dict[str, Any] | None]]) -> dict[str, Any]:
    """24 slots per date; an hour with no readings stays null, as the schema allows."""
    keys = ("date", "hour", *AGGREGATION_FIELDS)
    out: dict[str, list[dict[str, Any] | None]] = {}
    for date, slots in data.items():
        out[date] = [
            _clean_row(slot, keys) if slot is not None and _usable_row(slot) else None
            for slot in slots
        ]

    if not out:
        msg = "no hourly rows"
        raise RefusedError(msg)

    return {"data": out}


def serialise(payload: dict[str, Any]) -> bytes:
    # allow_nan=False: Python would otherwise emit bare NaN, which is invalid
    # JSON and would take the whole page down with an opaque parse error.
    return json.dumps(payload, allow_nan=False, separators=(",", ":")).encode("utf-8")


def _observation_time(value: str) -> datetime:
    at = datetime.fromisoformat(value)
    return at.replace(tzinfo=UTC) if at.tzinfo is None else at.astimezone(UTC)


def rain_totals(
    observations: Iterable[tuple[str, float | None]],
    tz: str,
) -> tuple[dict[str, float | None], dict[tuple[str, str], float | None]]:
    """Sum event-counter increments, in inches, into station-local days/hours.

    A reset starts a new event; small dips and rebounds do not count twice.
    Rain across a logging gap can be assigned to a day/hour only when both
    ends fall in that bucket. Unknown amounts remain null rather than zero.
    Replay the archive so an event spanning midnight keeps its earlier baseline.
    """
    zone = ZoneInfo(tz)
    daily: dict[str, float | None] = {}
    hourly: dict[tuple[str, str], float | None] = {}
    previous: float | None = None
    previous_at: datetime | None = None
    peak = 0.0

    def bucket(at: datetime) -> tuple[str, str]:
        local = at.astimezone(zone)
        return local.date().isoformat(), f"{local.hour:02d}"

    for timestamp, counter in observations:
        at = _observation_time(timestamp)
        day, hour = bucket(at)
        key = (day, hour)
        daily.setdefault(day, 0.0)
        hourly.setdefault(key, 0.0)
        if counter is None or not math.isfinite(counter) or counter < 0:
            daily[day] = hourly[key] = None
            continue

        if previous is None:
            delta = 0.0 if counter == 0 else None
            peak = counter
        elif counter < previous * 0.5:
            delta = counter
            peak = counter
        else:
            delta = max(0.0, counter - peak)
            peak = max(peak, counter)

        if delta is None:
            daily[day] = hourly[key] = None
        elif delta > 0:
            # With minute samples, attribute a tip to its first observed time.
            # Across outages, never invent which side of midnight/hour it fell.
            gap = (at - previous_at).total_seconds() if previous_at else 0
            uncertain_hours: set[tuple[str, str]] = set()
            if previous_at and gap > 600:
                cursor = previous_at.replace(minute=0, second=0, microsecond=0)
                while cursor <= at:
                    uncertain_hours.add(bucket(cursor))
                    cursor += timedelta(hours=1)
            uncertain_days = {key[0] for key in uncertain_hours}
            if len(uncertain_days) > 1:
                for uncertain_day in uncertain_days:
                    daily[uncertain_day] = None
            elif daily[day] is not None:
                daily[day] += delta
            if len(uncertain_hours) > 1:
                for uncertain_hour in uncertain_hours:
                    hourly[uncertain_hour] = None
            elif hourly[key] is not None:
                hourly[key] += delta

        previous = counter
        previous_at = at

    return daily, hourly


def add_rain_totals(
    documents: dict[str, dict[str, Any]], db_path: str, tz: str
) -> None:
    with closing(
        sqlite3.connect(f"{Path(db_path).resolve().as_uri()}?mode=ro", uri=True)
    ) as conn:
        daily, hourly = rain_totals(
            conn.execute(
                "SELECT ts, eventrain FROM observations WHERE ts <= ? ORDER BY ts",
                (documents["current.json"]["metadata"]["observed_at"],),
            ),
            tz,
        )
    for row in documents["daily.json"]["data"]:
        row["rain_total_in"] = _round(daily.get(row["date"]))
    for day, slots in documents["hourly.json"]["data"].items():
        for row in slots:
            if row is not None:
                row["rain_total_in"] = _round(hourly.get((day, row["hour"])))
    current = documents["current.json"]
    observed_at = current["metadata"].get("observed_at")
    if observed_at:
        at = _observation_time(observed_at)
        current["metadata"]["observed_at"] = at.isoformat()
        current["data"]["rain_total_in"] = _round(
            daily.get(at.astimezone(ZoneInfo(tz)).date().isoformat())
        )


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------


def build_documents(
    *,
    db_path: str,
    prior_days: int,
    tz: str,
) -> dict[str, dict[str, Any]]:
    latest_observation, daily_query, hourly_query = _import_library()

    if not Path(db_path).exists():
        msg = f"database not found: {db_path}"
        raise RefusedError(msg)

    current = build_current(latest_observation(db_path))
    daily = build_daily(
        daily_query(
            db_path=db_path,
            aggregation_fields=AGGREGATION_FIELDS,
            prior_days=prior_days,
            tz=tz,
        ),
    )

    # open-sun asks for hourly detail starting at the oldest day it shows, and a
    # published file cannot be re-queried per request. Bounding the window to
    # the days actually on screen is also what keeps this file ~50 KB instead of
    # dragging the station's entire history along.
    start_date = daily["data"][0]["date"]
    hourly = build_hourly(
        hourly_query(
            db_path=db_path,
            aggregation_fields=AGGREGATION_FIELDS,
            start_date=start_date,
            tz=tz,
        ),
    )

    documents = {"current.json": current, "daily.json": daily, "hourly.json": hourly}
    add_rain_totals(documents, db_path, tz)
    return documents


def run(
    *,
    db_path: str = DEFAULT_DB,
    out_dir: str | Path | None = None,
    prior_days: int = DEFAULT_PRIOR_DAYS,
    tz: str = STATION_TIME_ZONE,
    print_payload: bool = False,
) -> int:
    global _log_stream  # noqa: PLW0603 - one process-wide output channel
    _log_stream = sys.stderr if print_payload else sys.stdout

    try:
        documents = build_documents(db_path=db_path, prior_days=prior_days, tz=tz)
    except RefusedError as exc:
        print(f"refusing to publish station data: {exc}", file=sys.stderr, flush=True)
        return 2

    if print_payload:
        sys.stdout.write(json.dumps(documents, indent=2))
        return 0

    if out_dir is None:
        print(
            "--out-dir is required unless --print is given", file=sys.stderr, flush=True
        )
        return 2

    destination = Path(out_dir)
    destination.mkdir(parents=True, exist_ok=True)
    for name, document in documents.items():
        body = serialise(document)
        # Write then replace so a reader never sees a half-written file.
        temporary = destination / f".{name}.partial"
        temporary.write_bytes(body)
        temporary.replace(destination / name)
        _log(f"wrote {name}: {len(body)} bytes")

    days = len(documents["daily.json"]["data"])
    hours = sum(
        1
        for slots in documents["hourly.json"]["data"].values()
        for slot in slots
        if slot
    )
    _log(f"station documents ready: {days} days, {hours} populated hours")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--db", default=DEFAULT_DB, help="aw2sqlite database path")
    parser.add_argument("--out-dir", help="directory to write the documents into")
    parser.add_argument(
        "--prior-days",
        type=int,
        default=DEFAULT_PRIOR_DAYS,
        help="days of daily history, not counting today",
    )
    parser.add_argument("--tz", default=STATION_TIME_ZONE, help="grouping timezone")
    parser.add_argument(
        "--print",
        dest="print_payload",
        action="store_true",
        help="write the documents to stdout instead of the output directory",
    )
    args = parser.parse_args(argv)
    return run(
        db_path=args.db,
        out_dir=args.out_dir,
        prior_days=args.prior_days,
        tz=args.tz,
        print_payload=args.print_payload,
    )


if __name__ == "__main__":
    sys.exit(main())
