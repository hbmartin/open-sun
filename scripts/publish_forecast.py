#!/usr/bin/env python3
"""Publish a grounded-weather-forecast document to the open-sun ``data`` branch.

Reads the schema-v5/v6 document written by ``grounded-weather-forecast predict``,
transforms it into the open-sun publish contract (imperial units, no minutely
block), and force-pushes it as a single unparented commit on an orphan branch.
``lib/forecast-schemas.ts`` is the consumer of that contract; the two must be
changed together.

Why the transform exists at all: the pipeline is metric/SI end to end, open-sun
is imperial end to end, and the raw document carries ~180 KB of per-row
provenance the dashboard has no use for. Renaming ``temp_c`` to ``temp_f`` (and
declaring every unit in a ``units`` block the consumer asserts against) makes a
silent unit regression impossible.

Why an orphan branch rather than ``main``: the publisher runs hourly. Committing
to ``main`` would mean ~24 Vercel builds and 24 CI runs a day for a data file.
The ``data`` branch is fetched over raw.githubusercontent at ISR time instead,
and open-sun's existing hourly revalidate cron picks it up.

Git is driven through an ephemeral bare repository built in a temp directory and
destroyed afterwards: no index, no working tree, no state that can wedge between
unattended runs, and the developer's own open-sun checkout is never touched.

Exit codes:
    0  published (possibly without a failed town card), or unchanged output
    1  unexpected core programming/runtime error (traceback retained)
    2  refused: the source document is missing, malformed, or violates the
       contract (nothing is pushed, so the last good document keeps serving)
    3  a Git operation failed (pushes are retried)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
import tempfile
import time
import tomllib
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

PUBLISHER_VERSION = "1.4.5"
SUPPORTED_TOWN_CARD_API_VERSION = 1
CONTRACT_VERSION = 1
SOURCE_SCHEMA_VERSION = 6
SUPPORTED_SOURCE_SCHEMA_VERSIONS = frozenset({5, SOURCE_SCHEMA_VERSION})

DEFAULT_REMOTE = "git@github.com:hbmartin/open-sun.git"
DEFAULT_BRANCH = "data"

STAMP = Path.home() / "Library/Application Support/grounded-weather-forecast/last-published"

GIT = "/usr/bin/git"
SSH_KEY = Path.home() / ".ssh/id_ed25519"
KNOWN_HOSTS = Path.home() / ".ssh/known_hosts"

# The predict cron fires at :45 and raw.githubusercontent caches for ~5 minutes,
# so a document is at most ~10 minutes old when open-sun's :00 cron reads it.
ISSUE_INTERVAL_SECONDS = 3600

PUSH_RETRY_DELAYS_S = (0, 10, 30)
LOCAL_TIMEOUT_S = 30
PUSH_TIMEOUT_S = 90

# Bucket labels the consumer's zod enum knows about. An unrecognised bucket means
# the pipeline's horizon changed; refuse rather than publish a document the
# consumer would reject wholesale (a stale forecast beats a blank one).
KNOWN_LEAD_BUCKETS = frozenset(
    {"0-1h", "1-3h", "3-6h", "6-12h", "12-24h", "24-48h", "48-96h", "96-168h"}
)


# Diagnostics normally go to stdout so launchd files them under
# grounded-predict.log rather than the error log. Under --print, stdout is the
# payload channel, so they move aside to keep the JSON pipeable.
_log_stream = sys.stdout


def _log(message: str) -> None:
    print(message, file=_log_stream, flush=True)


HELD_GOOD = Path.home() / (
    "Library/Application Support/grounded-weather-forecast/last-good-forecast.json"
)
HOLD_MAX_AGE_SECONDS = 6 * 3600

# predict stamps issued_at and the publisher reads it back minutes later on the
# same machine, so a small negative age means the clock stepped backwards (an
# NTP correction) rather than a genuinely future document. Tolerating that keeps
# a two-second step from silently disabling the hold; tolerating more would let
# a corrupted timestamp pin a stale forecast for HOLD_MAX_AGE_SECONDS past the
# point it went stale.
CLOCK_SKEW_TOLERANCE_SECONDS = 300


def _write_held_snapshot(content: bytes, held: Path) -> None:
    """Atomically retain the exact source bytes already validated by the caller."""
    held.parent.mkdir(parents=True, exist_ok=True)
    partial = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=held.parent, prefix=f".{held.name}.", suffix=".partial", delete=False
        ) as output:
            partial = Path(output.name)
            output.write(content)
        partial.replace(held)
    finally:
        if partial is not None:
            try:
                partial.unlink(missing_ok=True)
            except OSError as exc:
                _log(f"could not remove temporary held snapshot {partial}: {exc}")


def _validated_snapshot(source: Path, clock: datetime) -> tuple[bytes, dict[str, Any]]:
    content, document = _read_document(source)
    prepare_forecast(document, clock)
    return content, document


def remember_good(
    source: Path, held: Path = HELD_GOOD, *, now: datetime | None = None
) -> None:
    """Keep a core-valid ready document, independently of publication success."""
    content, document = _validated_snapshot(
        source, now if now is not None else datetime.now(UTC)
    )
    if document.get("status") != "ready":
        raise RefusedError("only a ready forecast may enter the hold cache")
    _write_held_snapshot(content, held)


def choose_source(
    candidate: Path,
    held: Path = HELD_GOOD,
    *,
    max_age_seconds: float = HOLD_MAX_AGE_SECONDS,
    now: datetime | None = None,
) -> Path:
    """The document to publish: hold the last ready one through degraded windows.

    A ``degraded`` document is an honest fallback (raw provider means, no
    promoted methods, no calibration), and every code-identity change makes
    predict emit one until its restore cycle finishes — a planned, hour-scale
    window. Publishing it swaps the public forecast's character for that hour
    (the 2026-08-07 phantom-rain report was exactly this). Holding the last
    ready document is better until it is genuinely stale, at which point
    degraded-but-current beats ready-but-old. A held document dated further than
    CLOCK_SKEW_TOLERANCE_SECONDS into the future is refused too: its age is not
    trustworthy, so it cannot be judged stale. Expected incoming read or
    validation failures also consult the hold. Without an eligible, core-valid
    hold, return the candidate for normal publication/refusal. Unexpected core
    programming errors retain their traceback.
    """
    clock = now if now is not None else datetime.now(UTC)
    try:
        content, candidate_doc = _validated_snapshot(candidate, clock)
    except RefusedError as exc:
        _log(
            f"rejected incoming document {candidate}: {exc}; checking the held snapshot"
        )
        status = "invalid"
    else:
        status = candidate_doc["status"]
        if status == "ready":
            try:
                _write_held_snapshot(content, held)
            except OSError as exc:
                _log(f"could not remember the ready document: {exc}")
            return candidate
    try:
        held_doc = load_document(held)
        if held_doc.get("status") != "ready":
            raise RefusedError(
                f"held document is {held_doc.get('status')!r}, not ready"
            )
        issued = datetime.fromisoformat(
            _normalise_timestamp(held_doc.get("issued_at"), "held.issued_at")
        )
        age = (clock - issued).total_seconds()
        if age < -CLOCK_SKEW_TOLERANCE_SECONDS:
            raise RefusedError(f"held document is dated {-age / 60:.0f}m in the future")
        if age > max_age_seconds:
            raise RefusedError(f"held document too old ({age / 3600:.1f}h)")
        prepare_forecast(held_doc, clock)
    except RefusedError as exc:
        _log(
            f"status={status}; no usable held ready document: {exc} — publishing the candidate"
        )
        return candidate
    _log(
        f"status={status}; holding last ready document issued "
        f"{held_doc['issued_at']} ({age / 60:.0f}m old)"
    )
    return held


class RefusedError(Exception):
    """The source document violates the contract; do not publish."""


class GitError(Exception):
    """A git subprocess failed."""


def resolve_source(source: str | Path | None = None) -> Path:
    """Use the caller's input, active project, or a validated checkout sibling."""
    if source is not None:
        try:
            return Path(source).expanduser().resolve()
        except (OSError, ValueError, RuntimeError) as exc:
            raise RefusedError(f"invalid --source path: {exc}") from exc
    active = Path.cwd().resolve()
    candidate = active / "forecast.json"
    if candidate.is_file():
        return candidate
    try:
        metadata = active / "pyproject.toml"
        if metadata.is_file():
            project = tomllib.loads(metadata.read_text(encoding="utf-8")).get("project", {})
            if project.get("name") == "grounded-weather-forecast":
                return candidate  # Missing output here must not select another project.
        sources: set[Path] = set()
        for checkout in {active, Path(__file__).resolve().parent.parent}:
            package = checkout / "package.json"
            if not package.is_file():
                continue
            if json.loads(package.read_text(encoding="utf-8")).get("name") != "open-sun":
                continue
            sibling = checkout.parent / "grounded-weather-forecast"
            metadata = sibling / "pyproject.toml"
            if not metadata.is_file():
                continue
            project = tomllib.loads(metadata.read_text(encoding="utf-8")).get("project", {})
            if project.get("name") == "grounded-weather-forecast":
                sources.add(sibling.resolve() / "forecast.json")
    except (OSError, ValueError, AttributeError) as exc:
        raise RefusedError(f"cannot discover forecast source: {exc}; use --source") from exc
    if len(sources) == 1:
        return sources.pop()
    reason = "multiple forecast projects found" if sources else "no forecast project found"
    raise RefusedError(f"{reason}; run from the forecast project or pass --source <forecast.json>")


# --------------------------------------------------------------------------
# Conversions
#
# The divisors are the constants from the pipeline's own units.py, so a
# published value is the exact inverse of what the pipeline ingested. 33.8639 is
# that module's rounding of 33.863886...; matching it beats textbook precision.
# --------------------------------------------------------------------------

_MPH_TO_MS = 0.44704
_INHG_TO_HPA = 33.8639
_INCH_TO_MM = 25.4


def _c_to_f(value: float) -> float:
    return value * 9.0 / 5.0 + 32.0


def _ms_to_mph(value: float) -> float:
    return value / _MPH_TO_MS


def _hpa_to_inhg(value: float) -> float:
    return value / _INHG_TO_HPA


def _mm_to_inch(value: float) -> float:
    return value / _INCH_TO_MM


def _identity(value: float) -> float:
    return value


type Conversion = tuple[str, Callable[[float], float], int]

HOURLY_VARIABLES: dict[str, Conversion] = {
    "temp_c": ("temp_f", _c_to_f, 2),
    "humidity_pct": ("humidity_pct", _identity, 2),
    "dew_point_c": ("dew_point_f", _c_to_f, 2),
    "wind_speed_ms": ("wind_speed_mph", _ms_to_mph, 2),
    "wind_gust_ms": ("wind_gust_mph", _ms_to_mph, 2),
    "pressure_sea_hpa": ("pressure_sea_inhg", _hpa_to_inhg, 3),
    "precip_mm": ("precip_in", _mm_to_inch, 4),
    "pop": ("pop", _identity, 4),
}

DAILY_VARIABLES: dict[str, Conversion] = {
    "temp_max_c": ("temp_max_f", _c_to_f, 2),
    "temp_min_c": ("temp_min_f", _c_to_f, 2),
    "pop": ("pop", _identity, 4),
    "precip_sum_mm": ("precip_sum_in", _mm_to_inch, 4),
}

# Declared in the payload so the consumer can assert each one with z.literal().
# pop stays a fraction: the pipeline models it in [0, 1], scaling by 100 would
# add float noise and a second place to get the scale wrong. open-sun multiplies
# at render time.
UNITS: dict[str, str] = {
    "temp_f": "F",
    "temp_max_f": "F",
    "temp_min_f": "F",
    "dew_point_f": "F",
    "humidity_pct": "percent",
    "wind_speed_mph": "mph",
    "wind_gust_mph": "mph",
    "pressure_sea_inhg": "inHg",
    "precip_in": "in",
    "precip_sum_in": "in",
    "pop": "fraction",
}


def _convert(
    value: Any, conversion: Conversion, *, field: str = "value"
) -> float | None:
    """Map null/non-finite inputs to None; refuse a finite input's overflow.

    File inputs reject non-finite numbers before transformation. Keep this
    defensive cleanup for in-memory callers too: bare NaN in the output would
    be invalid JSON that kills the whole forecast client-side.
    """
    if value is None:
        return None
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        msg = f"{field}: expected a number, got {value!r}"
        raise RefusedError(msg)
    target, convert, digits = conversion
    try:
        number = float(value)
        if not math.isfinite(number):
            return None
        converted = convert(number)
        if not math.isfinite(converted):
            raise RefusedError(
                f"{field}: conversion to {target} produced a non-finite value"
            )
        # `+ 0.0` normalises the -0.0 that round() produces for small negatives.
        rounded = round(converted, digits) + 0.0
    except OverflowError as exc:
        raise RefusedError(f"{field}: conversion to {target} overflowed") from exc
    return rounded


def _lookup(variable: str, table: dict[str, Conversion], product: str) -> Conversion:
    if (conversion := table.get(variable)) is None:
        msg = (
            f"unknown {product} variable {variable!r}; the pipeline's variable set "
            f"changed and the publisher's conversion table has not caught up"
        )
        raise RefusedError(msg)
    return conversion


def _rename_map(source: Any, table: dict[str, Conversion], product: str) -> dict[str, str]:
    """Rename the keys of a per-variable metadata map (methods, release_ids,
    selection_reasons).

    The consumer schema types every value as a string, so anything else is
    refused here rather than poisoning the published document. Only None means
    an absent map; any other non-object is a broken row.
    """
    if source is None:
        return {}
    if not isinstance(source, dict):
        msg = f"expected an object, got {type(source).__name__}"
        raise RefusedError(msg)
    renamed: dict[str, str] = {}
    for variable, value in source.items():
        if not isinstance(value, str):
            msg = f"{product} metadata for {variable!r} is not a string: {value!r}"
            raise RefusedError(msg)
        renamed[_lookup(variable, table, product)[0]] = value
    return renamed


def _release_id_list(value: Any) -> list[str]:
    """The top-level promoted-release cohort; absent means an empty cohort."""
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        msg = f"release_ids is not a list of strings: {value!r}"
        raise RefusedError(msg)
    return list(value)


def _convert_values(source: Any, table: dict[str, Conversion], product: str) -> dict[str, Any]:
    if not isinstance(source, dict):
        msg = f"{product} row has no values object"
        raise RefusedError(msg)
    converted: dict[str, Any] = {}
    for variable, value in source.items():
        conversion = _lookup(variable, table, product)
        converted[conversion[0]] = _convert(
            value, conversion, field=f"{product} values.{variable}"
        )
    return converted


def _convert_quantiles(source: Any, table: dict[str, Conversion], product: str) -> dict[str, Any]:
    """Convert every level of every variable's quantile grid.

    Grids are inconsistent by design: six levels when a point-only method was
    dressed with residual quantiles, up to nineteen when the method emits a
    native distribution. Keys stay verbatim decimal probability strings; the
    consumer interpolates rather than indexing fixed levels.
    """
    if source is None:
        return {}
    if not isinstance(source, dict):
        msg = f"{product} row has a non-object quantiles map"
        raise RefusedError(msg)
    converted: dict[str, dict[str, float]] = {}
    for variable, grid in source.items():
        conversion = _lookup(variable, table, product)
        if not isinstance(grid, dict):
            msg = f"{product} quantiles for {variable!r} is not an object"
            raise RefusedError(msg)
        levels: dict[str, float] = {}
        for level, value in grid.items():
            if (
                converted_value := _convert(
                    value,
                    conversion,
                    field=f"{product} quantiles.{variable}[{level!r}]",
                )
            ) is not None:
                levels[level] = converted_value
        if levels:
            converted[conversion[0]] = levels
    return converted


def _normalise_timestamp(value: Any, field: str) -> str:
    """Re-emit an ISO timestamp at whole-second precision with an explicit offset.

    The consumer requires an offset (an offset-less timestamp is the genuinely
    dangerous case: it would be read as local time). Normalising here also strips
    the microseconds the pipeline puts on observation_at.
    """
    if not isinstance(value, str):
        msg = f"{field} is not a string"
        raise RefusedError(msg)
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        msg = f"{field} is not an ISO timestamp: {value!r}"
        raise RefusedError(msg) from exc
    if parsed.tzinfo is None:
        msg = f"{field} has no UTC offset: {value!r}"
        raise RefusedError(msg)
    return parsed.replace(microsecond=0).isoformat()


def _normalise_optional_timestamp(value: Any, field: str) -> str | None:
    if value is None:
        return None
    return _normalise_timestamp(value, field)


def _object(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RefusedError(f"{field}: expected an object, got {type(value).__name__}")
    return value


def _product_rows(document: dict[str, Any], product: str) -> list[dict[str, Any]]:
    rows = document.get(product)
    if rows is None:
        return []
    if not isinstance(rows, list):
        raise RefusedError(f"{product}: expected an array, got {type(rows).__name__}")
    for index, row in enumerate(rows):
        _object(row, f"{product}[{index}]")
    return rows


def _truth_semantics(document: dict[str, Any]) -> dict[str, str]:
    """Hoist the per-row truth_semantics maps to a single per-variable block.

    Every row repeats the same answer for a given variable, so carrying it once
    at the top level costs nothing and tells the consumer whether a value is an
    hour-mean or an instantaneous reading. Conflicting answers would mean the
    invariant broke, which is worth refusing over.

    The window this implies: dataset/truth.py builds hourly truth by grouping
    minute observations with ``dt.truncate("1h")``, which floors to the start of
    the hour. So a "mean" value at valid_time T is the average over
    [T, T+1h), and an "inst" value is the reading at T itself.
    """
    semantics: dict[str, str] = {}
    for product, table in (("hourly", HOURLY_VARIABLES), ("daily", DAILY_VARIABLES)):
        for index, row in enumerate(_product_rows(document, product)):
            field = f"{product}[{index}].truth_semantics"
            source = row.get("truth_semantics")
            for variable, value in (
                {} if source is None else _object(source, field)
            ).items():
                if not isinstance(value, str):
                    raise RefusedError(f"{field}[{variable!r}]: expected a string")
                try:
                    name = _lookup(variable, table, product)[0]
                except RefusedError as exc:
                    raise RefusedError(f"{field}: {exc}") from exc
                if semantics.setdefault(name, value) != value:
                    msg = (
                        f"{field}: truth_semantics for {name!r} is not constant across rows "
                        f"({semantics[name]!r} vs {value!r})"
                    )
                    raise RefusedError(msg)
    return semantics


def _hourly_row(row: dict[str, Any]) -> dict[str, Any]:
    _object(row, "hourly row")
    bucket = row.get("lead_bucket")
    if not isinstance(bucket, str) or bucket not in KNOWN_LEAD_BUCKETS:
        msg = (
            f"unknown lead_bucket {bucket!r}; the pipeline's horizon changed and "
            f"the consumer's enum would reject the whole document"
        )
        raise RefusedError(msg)
    return {
        "valid_time": _normalise_timestamp(row.get("valid_time"), "hourly.valid_time"),
        "lead_hours": row.get("lead_hours"),
        "lead_bucket": bucket,
        "values": _convert_values(row.get("values"), HOURLY_VARIABLES, "hourly"),
        "methods": _rename_map(row.get("methods"), HOURLY_VARIABLES, "hourly"),
        "release_ids": _rename_map(row.get("release_ids"), HOURLY_VARIABLES, "hourly"),
        "quantiles": _convert_quantiles(row.get("quantiles"), HOURLY_VARIABLES, "hourly"),
        "selection_reasons": _rename_map(
            row.get("selection_reasons"), HOURLY_VARIABLES, "hourly"
        ),
    }


def _daily_row(row: dict[str, Any]) -> dict[str, Any]:
    _object(row, "daily row")
    date_local = row.get("date_local")
    if not isinstance(date_local, str):
        msg = "daily row has no date_local"
        raise RefusedError(msg)
    return {
        "date_local": date_local,
        "lead_days": row.get("lead_days"),
        "values": _convert_values(row.get("values"), DAILY_VARIABLES, "daily"),
        "methods": _rename_map(row.get("methods"), DAILY_VARIABLES, "daily"),
        "release_ids": _rename_map(row.get("release_ids"), DAILY_VARIABLES, "daily"),
        "quantiles": _convert_quantiles(row.get("quantiles"), DAILY_VARIABLES, "daily"),
        "selection_reasons": _rename_map(
            row.get("selection_reasons"), DAILY_VARIABLES, "daily"
        ),
    }


def _transform_rows(
    document: dict[str, Any],
    product: str,
    builder: Callable[[dict[str, Any]], dict[str, Any]],
) -> list[dict[str, Any]]:
    result = []
    for index, row in enumerate(_product_rows(document, product)):
        try:
            result.append(builder(row))
        except RefusedError as exc:
            raise RefusedError(f"{product}[{index}]: {exc}") from exc
    return result


def transform(document: dict[str, Any], published_at: datetime) -> dict[str, Any]:
    """Map the reviewed schema-v5/v6 shapes onto the open-sun contract.

    Schema 6 changes minutely release attribution. The published hourly/daily
    shape is compatible with schema 5; minutely rows are deliberately omitted.
    """
    _object(document, "forecast")
    version = document.get("schema_version")
    if type(version) is not int or version not in SUPPORTED_SOURCE_SCHEMA_VERSIONS:
        msg = (
            f"source schema_version is {version!r}, expected 5 or {SOURCE_SCHEMA_VERSION}; "
            f"review the contract before republishing"
        )
        raise RefusedError(msg)

    status = document.get("status")
    if not isinstance(status, str) or status not in {"ready", "degraded"}:
        msg = f"unknown status {status!r}"
        raise RefusedError(msg)

    # A degraded document is still published. It carries real values from
    # fallback methods and says so in status/status_reason; blanking the site
    # over an evidence-gate trip would be the worse failure.
    status_reason = document.get("status_reason")
    if status == "degraded" and not status_reason:
        status_reason = "serving gate reported no usable backtest evidence"

    return {
        "schema_version": CONTRACT_VERSION,
        "publisher_version": PUBLISHER_VERSION,
        "source_schema_version": version,
        "published_at": published_at.replace(microsecond=0).isoformat(),
        "issued_at": _normalise_timestamp(document.get("issued_at"), "issued_at"),
        "observation_at": _normalise_optional_timestamp(
            document.get("observation_at"), "observation_at"
        ),
        "issue_interval_seconds": ISSUE_INTERVAL_SECONDS,
        "timezone": document.get("timezone"),
        "latitude": document.get("latitude"),
        "longitude": document.get("longitude"),
        "dataset_fingerprint": document.get("dataset_fingerprint"),
        "sources": document.get("sources") or [],
        "release_ids": _release_id_list(document.get("release_ids")),
        "status": status,
        "status_reason": status_reason,
        "units": dict(UNITS),
        "truth_semantics": _truth_semantics(document),
        "hourly": _transform_rows(document, "hourly", _hourly_row),
        "daily": _transform_rows(document, "daily", _daily_row),
    }


def _finite_json_float(token: str) -> float:
    value = float(token)
    if not math.isfinite(value):
        raise ValueError(f"number exceeds the finite range: {token[:80]}")
    return value


def _finite_json_int(token: str) -> int:
    # Preserve integer precision, but refuse integers that overflow a browser's
    # floating-point representation just as we refuse overflowing exponents.
    _finite_json_float(token)
    return int(token)


def _reject_json_constant(token: str) -> None:
    raise ValueError(f"nonstandard numeric constant: {token}")


def strict_json_loads(content: str | bytes, source: Path) -> Any:
    """Validate untrusted publication input at its parsing boundary."""
    try:
        return json.loads(
            content,
            parse_constant=_reject_json_constant,
            parse_float=_finite_json_float,
            parse_int=_finite_json_int,
        )
    except ValueError as exc:
        raise RefusedError(f"{source} is not valid JSON: {exc}") from exc


def _read_document(source: Path) -> tuple[bytes, dict[str, Any]]:
    """Keep the original bytes alongside the strictly parsed source object."""
    try:
        content = source.read_bytes()
        raw = content.decode("utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        msg = f"cannot read {source}: {exc}"
        raise RefusedError(msg) from exc
    document = strict_json_loads(raw, source)
    if not isinstance(document, dict):
        msg = f"{source} does not contain a JSON object"
        raise RefusedError(msg)
    return content, document


def load_document(source: Path) -> dict[str, Any]:
    return _read_document(source)[1]


def serialise(payload: dict[str, Any]) -> bytes:
    """Serialise compactly, and never emit bare NaN/Infinity.

    Python's json defaults to writing NaN, which is invalid JSON: the consumer's
    response.json() would throw and the entire forecast would vanish behind an
    opaque parse error.
    """
    text = json.dumps(payload, allow_nan=False, separators=(",", ":"))
    return text.encode("utf-8") + b"\n"


@dataclass(frozen=True)
class PreparedFile:
    """Exact Git bytes and an explicitly prepared comparison digest."""

    content: bytes
    comparison_digest: str

    @classmethod
    def raw(cls, content: bytes) -> PreparedFile:
        return cls(content, hashlib.sha256(content).hexdigest())

    @classmethod
    def document(cls, payload: dict[str, Any]) -> PreparedFile:
        comparison = {
            key: payload[key] for key in sorted(payload) if key != "published_at"
        }
        # Nested order can affect interpolation between duplicate probabilities.
        # Normalize root field order only; preserve all nested maps as supplied.
        canonical = json.dumps(
            comparison, allow_nan=False, separators=(",", ":")
        ).encode("utf-8")
        return cls(serialise(payload), hashlib.sha256(canonical).hexdigest())


def prepare_forecast(
    document: dict[str, Any], published_at: datetime
) -> tuple[dict[str, Any], PreparedFile]:
    """The same core transform/serialization checks for publication and holds."""
    payload = transform(document, published_at)
    return payload, PreparedFile.document(payload)


# --------------------------------------------------------------------------
# Git
# --------------------------------------------------------------------------

DATA_BRANCH_README = """\
# open-sun data branch

Machine-generated. Do not merge, do not commit here by hand.

`forecast.json` is a published grounded-weather-forecast document (imperial
units, no minutely block) written hourly by `publish_forecast.py`, which lives
at `scripts/publish_forecast.py` on `main` and is deployed to
`~/Library/Application Support/grounded-weather-forecast/`.

`town-card.json` is the versioned, compact Lake Arrowhead homepage document,
rendered by the stdlib `scripts/town_card.py` helper when available. It is omitted
on card-generation failure or when no usable observation or forecast remains;
the forecast and station documents continue publishing. Treat a missing card
as unavailable rather than retaining previously fetched content indefinitely.

`current.json`, `daily.json` and `hourly.json` are station observations,
rendered from the ambientweather2sqlite database by `publish_station.py`
(`scripts/publish_station.py` on `main`) and folded into the same commit. The
station is a LAN device with no route from Vercel, so publishing here is what
lets `app/page.tsx` prerender at build time.

This branch is force-pushed as a single unparented commit each hour, so it has
no history and no diffs -- every file must be rewritten together or the ones
left out are deleted. `vercel.json` here disables deployments for the branch.

The contracts are consumed by `lib/forecast-schemas.ts` and `lib/schemas.ts` on
`main`; publisher and consumer must change together. `forecast.json` includes
`publisher_version`, identifying the forecast publisher release. The card and
station documents do not carry that release marker.
"""

# Names this script writes itself; an --include-dir may not shadow them.
RESERVED_BRANCH_FILES = frozenset({"README.md", "forecast.json", "vercel.json", "town-card.json"})

DATA_BRANCH_VERCEL = """\
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": false
  }
}
"""


def _git_env(git_dir: Path) -> dict[str, str]:
    """Build a hermetic environment for every git subprocess.

    Nulling both config scopes drops any dependence on ~/.gitconfig (which sets
    an interactive editor) and on the Xcode-supplied system gitconfig (the only
    thing configuring credential.helper, and it would vanish with an xcode-select
    change). That makes the identity variables mandatory rather than optional.

    Auth is SSH with an explicit key file: there is no stored HTTPS credential
    for github.com, so an HTTPS push would fail non-interactively, and the key is
    passphrase-free so it needs no agent -- which launchd does not provide.
    """
    ssh_command = (
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes "
        f"-i {SSH_KEY} -o UserKnownHostsFile={KNOWN_HOSTS}"
    )
    return {
        "GIT_DIR": str(git_dir),
        "GIT_SSH_COMMAND": ssh_command,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_ASKPASS": "/usr/bin/true",
        "SSH_ASKPASS": "/usr/bin/true",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_SYSTEM": "/dev/null",
        "GIT_AUTHOR_NAME": "grounded-weather-forecast",
        "GIT_AUTHOR_EMAIL": "grounded@localhost",
        "GIT_COMMITTER_NAME": "grounded-weather-forecast",
        "GIT_COMMITTER_EMAIL": "grounded@localhost",
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        "HOME": str(Path.home()),
    }


def _git(
    args: list[str],
    env: dict[str, str],
    *,
    stdin: bytes | None = None,
    timeout: int = LOCAL_TIMEOUT_S,
) -> str:
    try:
        result = subprocess.run(  # noqa: S603 - fixed binary, no shell
            [GIT, *args],
            env=env,
            input=stdin,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        msg = f"git {args[0]} timed out after {timeout}s"
        raise GitError(msg) from exc
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()
        msg = f"git {args[0]} exited {result.returncode}: {detail}"
        raise GitError(msg)
    return result.stdout.decode("utf-8").strip()


def collect_extra_blobs(include_dir: Path) -> tuple[dict[str, PreparedFile], Any]:
    """Read the station documents that share this commit.

    The branch is one unparented commit force-pushed wholesale, so anything not
    in this tree is deleted from the branch. Station and forecast documents
    therefore cannot be published by two independent jobs -- they would erase
    each other every hour -- which is why publish_station.py writes to a
    directory and this function folds the result in.
    """
    if not include_dir.is_dir():
        msg = f"--include-dir {include_dir} is not a directory"
        raise RefusedError(msg)

    blobs: dict[str, PreparedFile] = {}
    current = None
    for path in sorted(include_dir.glob("*.json")):
        if path.name in RESERVED_BRANCH_FILES:
            # Silently overwriting forecast.json with a station document would
            # be an unusually quiet way to lose the forecast.
            msg = f"{path.name} in {include_dir} collides with a file this script owns"
            raise RefusedError(msg)
        try:
            content = path.read_bytes()
        except OSError as exc:
            raise RefusedError(f"cannot read {path}: {exc}") from exc
        # Refuse rather than publish a file the consumer cannot parse; a stale
        # document keeps the page working, a truncated one does not.
        document = strict_json_loads(content, path)
        blobs[path.name] = PreparedFile.raw(content)
        if path.name == "current.json":
            current = document

    if not blobs:
        msg = f"--include-dir {include_dir} contains no .json files"
        raise RefusedError(msg)
    return blobs, current


def build_commit(
    blobs: dict[str, bytes],
    git_dir: Path,
    branch: str,
    issued_at: str,
) -> str:
    """Commit an already prepared file map; no weather logic belongs here."""
    env = _git_env(git_dir)
    _git(["init", "--bare", "--quiet", f"--initial-branch={branch}", str(git_dir)], env)

    # mktree wants entries sorted by name.
    entries = "".join(
        f"100644 blob {_git(['hash-object', '-w', '--stdin'], env, stdin=content)}\t{name}\n"
        for name, content in sorted(blobs.items())
    )
    tree = _git(["mktree"], env, stdin=entries.encode("utf-8"))

    message = (
        f"forecast issued {issued_at}\n\n"
        f"Machine-generated by publish_forecast.py {PUBLISHER_VERSION}. "
        f"Force-pushed hourly; this branch is data only and must not be merged.\n"
    )
    # No -p: each push replaces the branch wholesale, so it stays one commit deep.
    commit = _git(["commit-tree", tree, "-m", message], env)
    _git(["update-ref", f"refs/heads/{branch}", commit], env)
    return commit


def push(git_dir: Path, remote: str, branch: str) -> None:
    env = _git_env(git_dir)
    refspec = f"refs/heads/{branch}:refs/heads/{branch}"
    last: GitError | None = None
    for attempt, delay in enumerate(PUSH_RETRY_DELAYS_S, start=1):
        if delay:
            time.sleep(delay)
        try:
            _git(
                ["push", "--force", "--quiet", remote, refspec],
                env,
                timeout=PUSH_TIMEOUT_S,
            )
        except GitError as exc:
            last = exc
            _log(f"push attempt {attempt} failed: {exc}")
        else:
            return
    raise last if last else GitError("push produced no result")


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------


def _report_card_failure(reason: str) -> None:
    """Report an unexpected optional-helper failure from its exception handler."""
    print(f"warning: omitting town-card.json: {reason}", file=sys.stderr, flush=True)
    traceback.print_exc()


def prepare_town_card(payload: dict[str, Any], current: Any) -> PreparedFile | None:
    """An optional output may fail without stopping the core publication."""
    try:
        import town_card as helper
    except Exception:
        _report_card_failure("helper unavailable")
        return None

    api_version = getattr(helper, "TOWN_CARD_API_VERSION", None)
    if type(api_version) is not int or api_version != SUPPORTED_TOWN_CARD_API_VERSION:
        print(
            "warning: omitting town-card.json: incompatible helper API "
            f"(expected {SUPPORTED_TOWN_CARD_API_VERSION}, actual {api_version!r}, "
            f"helper {getattr(helper, '__file__', '<unknown>')})",
            file=sys.stderr,
            flush=True,
        )
        return None

    try:
        build_town_card = helper.build_town_card
        CardInputError = helper.CardInputError
        if (
            not callable(build_town_card)
            or not isinstance(CardInputError, type)
            or not issubclass(CardInputError, Exception)
            or CardInputError.__module__ == "builtins"
        ):
            raise TypeError(
                "helper API exports must be a builder and custom exception class"
            )
    except Exception:
        _report_card_failure("unexpected error")
        return None

    try:
        card = build_town_card(
            payload,
            current,
            diagnostic=lambda message: print(
                f"warning: town-card.json: {message}", file=sys.stderr, flush=True
            ),
        )
        if not isinstance(card, dict):
            raise TypeError("town-card builder must return an object")
        return PreparedFile.document(card)
    except CardInputError as exc:
        print(f"warning: omitting town-card.json: {exc}", file=sys.stderr, flush=True)
    except Exception:
        _report_card_failure("unexpected error")
    return None


def publication_fingerprint(
    files: dict[str, PreparedFile], remote: str, branch: str
) -> str:
    """Identify the destination and prepared comparisons without reparsing files."""
    digests = {name: entry.comparison_digest for name, entry in files.items()}
    identity = json.dumps(
        [remote, branch, digests], sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(identity).hexdigest()


def publication_state_path(remote: str, branch: str) -> Path:
    destination = json.dumps([remote, branch], separators=(",", ":")).encode("utf-8")
    name = hashlib.sha256(destination).hexdigest()
    return STAMP.with_name("last-published-states") / f"{name}.json"


def read_publication_state(remote: str, branch: str) -> str | None:
    path = publication_state_path(remote, branch)
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if (
        not isinstance(state, dict)
        or type(state.get("schema_version")) is not int
        or state["schema_version"] != 1
        or state.get("remote") != remote
        or state.get("branch") != branch
    ):
        return None
    fingerprint = state.get("fingerprint")
    if (
        isinstance(fingerprint, str)
        and len(fingerprint) == 64
        and all(c in "0123456789abcdef" for c in fingerprint)
    ):
        return fingerprint
    return None


def write_publication_state(fingerprint: str, remote: str, branch: str) -> None:
    """Record a successful push atomically; failure only costs a redundant push."""
    path = publication_state_path(remote, branch)
    partial = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            delete=False,
        ) as output:
            partial = Path(output.name)
            json.dump(
                {
                    "schema_version": 1,
                    "remote": remote,
                    "branch": branch,
                    "fingerprint": fingerprint,
                },
                output,
            )
            output.write("\n")
        partial.replace(path)
    except OSError as exc:
        _log(f"warning: could not write publication state {path}: {exc}")
    finally:
        if partial is not None:
            try:
                partial.unlink(missing_ok=True)
            except OSError as exc:
                _log(
                    f"warning: could not remove temporary publication state {partial}: {exc}"
                )


def write_stamp(issued_at: str) -> None:
    try:
        STAMP.parent.mkdir(parents=True, exist_ok=True)
        STAMP.write_text(f"{issued_at}\n", encoding="utf-8")
    except OSError as exc:
        # This legacy issue-time stamp is retained for production observers.
        # Publication deduplication uses the separate fingerprint state.
        _log(f"warning: could not write stamp {STAMP}: {exc}")


def run(
    *,
    source: str | Path | None = None,
    remote: str = DEFAULT_REMOTE,
    branch: str = DEFAULT_BRANCH,
    print_payload: bool = False,
    dry_run: bool = False,
    no_push: bool = False,
    force: bool = False,
    include_dir: str | Path | None = None,
    now: datetime | None = None,
) -> int:
    global _log_stream  # noqa: PLW0603 - one process-wide output channel
    _log_stream = sys.stderr if print_payload else sys.stdout

    try:
        document = load_document(resolve_source(source))
        payload, forecast_file = prepare_forecast(
            document, now if now is not None else datetime.now(UTC)
        )
        extra_blobs, current = (
            collect_extra_blobs(Path(include_dir)) if include_dir else ({}, None)
        )
    except RefusedError as exc:
        print(f"refusing to publish: {exc}", file=sys.stderr, flush=True)
        return 2

    body = forecast_file.content
    issued_at = payload["issued_at"]
    town = prepare_town_card(payload, current)
    files = {
        "README.md": PreparedFile.raw(DATA_BRANCH_README.encode("utf-8")),
        "forecast.json": forecast_file,
        "vercel.json": PreparedFile.raw(DATA_BRANCH_VERCEL.encode("utf-8")),
        **extra_blobs,
    }
    if town is not None:
        files["town-card.json"] = town
    fingerprint = publication_fingerprint(files, remote, branch)

    if print_payload:
        sys.stdout.write(body.decode("utf-8"))

    if dry_run:
        _log(
            f"dry run: {issued_at} ({payload['status']}), "
            f"{len(payload['hourly'])} hourly + {len(payload['daily'])} daily, "
            f"{len(body)} bytes"
            + (f", plus {len(extra_blobs)} station document(s)" if extra_blobs else "")
        )
        return 0

    if (
        not force
        and not no_push
        and read_publication_state(remote, branch) == fingerprint
    ):
        _log(f"{issued_at}: publication state unchanged; skipping")
        return 0

    temporary = tempfile.mkdtemp(
        prefix="grounded-publish.", dir=Path.home() / "Library/Caches"
    )
    try:
        git_dir = Path(temporary) / "repo.git"
        commit = build_commit(
            {name: entry.content for name, entry in files.items()},
            git_dir,
            branch,
            issued_at,
        )
        if no_push:
            # A debugging flag: keep the repo behind so the tree can be inspected.
            _log(f"built {commit} (not pushed); inspect with:")
            _log(f"  git --git-dir {git_dir} cat-file -p {commit}^{{tree}}")
            return 0
        push(git_dir, remote, branch)
    except GitError as exc:
        print(f"publish failed: {exc}", file=sys.stderr, flush=True)
        return 3
    finally:
        if not no_push:
            shutil.rmtree(temporary, ignore_errors=True)

    if remote == DEFAULT_REMOTE and branch == DEFAULT_BRANCH:
        write_stamp(issued_at)
    write_publication_state(fingerprint, remote, branch)
    _log(
        f"published {issued_at} ({payload['status']}) as {commit[:12]} "
        f"to {branch}: {len(body)} bytes"
        + (f" + {', '.join(sorted(extra_blobs))}" if extra_blobs else "")
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--source", help="forecast.json (default: active project or validated checkout sibling)")
    parser.add_argument("--remote", default=DEFAULT_REMOTE, help="git remote to push to")
    parser.add_argument("--branch", default=DEFAULT_BRANCH, help="branch to force-push")
    parser.add_argument("--print", dest="print_payload", action="store_true",
                        help="write the transformed document to stdout")
    parser.add_argument("--dry-run", action="store_true",
                        help="transform only: no git, no network, no stamp")
    parser.add_argument("--no-push", action="store_true",
                        help="always build the commit locally but do not push")
    parser.add_argument("--force", action="store_true",
                        help="publish even if the output state is unchanged")
    parser.add_argument("--include-dir",
                        help="directory of station .json documents to publish alongside")
    args = parser.parse_args(argv)
    return run(
        source=args.source,
        remote=args.remote,
        branch=args.branch,
        print_payload=args.print_payload,
        dry_run=args.dry_run,
        no_push=args.no_push,
        force=args.force,
        include_dir=args.include_dir,
    )


if __name__ == "__main__":
    sys.exit(main())
