#!/usr/bin/env python3
"""Publish a grounded-weather-forecast document to the open-sun ``data`` branch.

Reads the schema-v5 document written by ``grounded-weather-forecast predict``,
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
    0  published, or skipped because ``issued_at`` had not advanced
    2  refused: the source document is missing, malformed, or violates the
       contract (nothing is pushed, so the last good document keeps serving)
    3  the push failed after retries
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

PUBLISHER_VERSION = "1.2.0"
CONTRACT_VERSION = 1
SOURCE_SCHEMA_VERSION = 5

DEFAULT_SOURCE = "/Volumes/ExtStor/weather/grounded-weather-forecast/forecast.json"
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
KNOWN_LEAD_BUCKETS = frozenset({"0-1h", "1-3h", "3-6h", "6-12h", "12-24h", "24-48h", "48-96h"})


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


def remember_good(source: Path, held: Path = HELD_GOOD) -> None:
    """Keep a copy of the newest ready document for degraded-window holds."""
    held.parent.mkdir(parents=True, exist_ok=True)
    partial = held.with_suffix(".partial")
    shutil.copyfile(source, partial)
    partial.replace(held)


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
    trustworthy, so it cannot be judged stale. Any read or parse problem
    publishes the candidate unchanged: this guard must never block a publish.
    """
    try:
        candidate_doc = json.loads(candidate.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return candidate
    if not isinstance(candidate_doc, dict):
        # Valid JSON that is not an object: load_document refuses it downstream
        # with a clean message and exit 2. Returning it here rather than letting
        # .get() raise AttributeError is what keeps that refusal clean.
        return candidate
    status = candidate_doc.get("status")
    if status == "ready":
        try:
            remember_good(candidate, held)
        except OSError as exc:
            _log(f"could not remember the ready document: {exc}")
        return candidate
    try:
        held_doc = json.loads(held.read_text(encoding="utf-8"))
        issued = datetime.fromisoformat(str(held_doc["issued_at"]))
    except (OSError, ValueError, KeyError, TypeError):
        _log(f"status={status}; no held ready document — publishing the candidate")
        return candidate
    if issued.tzinfo is None:
        issued = issued.replace(tzinfo=UTC)
    age = ((now or datetime.now(UTC)) - issued).total_seconds()
    within_hold_window = -CLOCK_SKEW_TOLERANCE_SECONDS <= age <= max_age_seconds
    if held_doc.get("status") == "ready" and within_hold_window:
        _log(
            f"status={status}; holding last ready document issued "
            f"{held_doc['issued_at']} ({age / 60:.0f}m old)"
        )
        return held
    if held_doc.get("status") != "ready":
        reason = f"held document is {held_doc.get('status')!r}, not ready"
    elif age < 0:
        reason = f"held document is dated {-age / 60:.0f}m in the future"
    else:
        reason = f"held document too old ({age / 3600:.1f}h)"
    _log(f"status={status}; {reason} — publishing the candidate honestly")
    return candidate


class RefusedError(Exception):
    """The source document violates the contract; do not publish."""


class GitError(Exception):
    """A git subprocess failed."""


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


def _convert(value: Any, conversion: Conversion) -> float | None:
    """Convert one value, mapping null and non-finite alike to None.

    Non-finite input cannot reach us through the pipeline's own writer (it uses
    allow_nan=False) but a hand-edited file could carry it, and bare NaN in the
    output would be invalid JSON that kills the whole forecast client-side.
    """
    if value is None:
        return None
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        msg = f"expected a number, got {value!r}"
        raise RefusedError(msg)
    if not math.isfinite(value):
        return None
    _, convert, digits = conversion
    # `+ 0.0` normalises the -0.0 that round() produces for small negatives.
    return round(convert(float(value)), digits) + 0.0


def _lookup(variable: str, table: dict[str, Conversion], product: str) -> Conversion:
    if (conversion := table.get(variable)) is None:
        msg = (
            f"unknown {product} variable {variable!r}; the pipeline's variable set "
            f"changed and the publisher's conversion table has not caught up"
        )
        raise RefusedError(msg)
    return conversion


def _rename_map(source: Any, table: dict[str, Conversion], product: str) -> dict[str, Any]:
    """Rename the keys of a per-variable metadata map (methods, release_ids)."""
    if not source:
        return {}
    if not isinstance(source, dict):
        msg = f"expected an object, got {type(source).__name__}"
        raise RefusedError(msg)
    return {
        _lookup(variable, table, product)[0]: value for variable, value in source.items()
    }


def _convert_values(source: Any, table: dict[str, Conversion], product: str) -> dict[str, Any]:
    if not isinstance(source, dict):
        msg = f"{product} row has no values object"
        raise RefusedError(msg)
    converted: dict[str, Any] = {}
    for variable, value in source.items():
        conversion = _lookup(variable, table, product)
        converted[conversion[0]] = _convert(value, conversion)
    return converted


def _convert_quantiles(source: Any, table: dict[str, Conversion], product: str) -> dict[str, Any]:
    """Convert every level of every variable's quantile grid.

    Grids are inconsistent by design: six levels when a point-only method was
    dressed with residual quantiles, up to nineteen when the method emits a
    native distribution. Keys stay verbatim decimal probability strings; the
    consumer interpolates rather than indexing fixed levels.
    """
    if not source:
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
            if (converted_value := _convert(value, conversion)) is not None:
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
        for row in document.get(product) or []:
            for variable, value in (row.get("truth_semantics") or {}).items():
                name = _lookup(variable, table, product)[0]
                if semantics.setdefault(name, value) != value:
                    msg = (
                        f"truth_semantics for {name!r} is not constant across rows "
                        f"({semantics[name]!r} vs {value!r})"
                    )
                    raise RefusedError(msg)
    return semantics


def _hourly_row(row: dict[str, Any]) -> dict[str, Any]:
    bucket = row.get("lead_bucket")
    if bucket not in KNOWN_LEAD_BUCKETS:
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
    }


def _daily_row(row: dict[str, Any]) -> dict[str, Any]:
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
    }


def transform(document: dict[str, Any], published_at: datetime) -> dict[str, Any]:
    """Map a schema-v5 forecast document onto the open-sun publish contract."""
    if (version := document.get("schema_version")) != SOURCE_SCHEMA_VERSION:
        msg = (
            f"source schema_version is {version!r}, expected {SOURCE_SCHEMA_VERSION}; "
            f"review the contract before republishing"
        )
        raise RefusedError(msg)

    status = document.get("status")
    if status not in {"ready", "degraded"}:
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
        "source_schema_version": SOURCE_SCHEMA_VERSION,
        "published_at": published_at.replace(microsecond=0).isoformat(),
        "issued_at": _normalise_timestamp(document.get("issued_at"), "issued_at"),
        "observation_at": _normalise_timestamp(
            document.get("observation_at"), "observation_at"
        ),
        "issue_interval_seconds": ISSUE_INTERVAL_SECONDS,
        "timezone": document.get("timezone"),
        "latitude": document.get("latitude"),
        "longitude": document.get("longitude"),
        "dataset_fingerprint": document.get("dataset_fingerprint"),
        "sources": document.get("sources") or [],
        "status": status,
        "status_reason": status_reason,
        "units": dict(UNITS),
        "truth_semantics": _truth_semantics(document),
        "hourly": [_hourly_row(row) for row in document.get("hourly") or []],
        "daily": [_daily_row(row) for row in document.get("daily") or []],
    }


def load_document(source: Path) -> dict[str, Any]:
    try:
        raw = source.read_text(encoding="utf-8")
    except OSError as exc:
        msg = f"cannot read {source}: {exc}"
        raise RefusedError(msg) from exc
    try:
        document = json.loads(raw)
    except json.JSONDecodeError as exc:
        # predict writes forecast.json non-atomically, so a truncated read is a
        # real possibility rather than a theoretical one.
        msg = f"{source} is not valid JSON (truncated write?): {exc}"
        raise RefusedError(msg) from exc
    if not isinstance(document, dict):
        msg = f"{source} does not contain a JSON object"
        raise RefusedError(msg)
    return document


def serialise(payload: dict[str, Any]) -> bytes:
    """Serialise compactly, and never emit bare NaN/Infinity.

    Python's json defaults to writing NaN, which is invalid JSON: the consumer's
    response.json() would throw and the entire forecast would vanish behind an
    opaque parse error.
    """
    text = json.dumps(payload, allow_nan=False, separators=(",", ":"))
    return text.encode("utf-8") + b"\n"


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

`current.json`, `daily.json` and `hourly.json` are station observations,
rendered from the ambientweather2sqlite database by `publish_station.py`
(`scripts/publish_station.py` on `main`) and folded into the same commit. The
station is a LAN device with no route from Vercel, so publishing here is what
lets `app/page.tsx` prerender at build time.

This branch is force-pushed as a single unparented commit each hour, so it has
no history and no diffs -- every file must be rewritten together or the ones
left out are deleted. `vercel.json` here disables deployments for the branch.

The contracts are consumed by `lib/forecast-schemas.ts` and `lib/schemas.ts` on
`main`; publisher and consumer must change together. `publisher_version`
identifies the exact script that produced each document.
"""

# Names this script writes itself; an --include-dir may not shadow them.
RESERVED_BRANCH_FILES = frozenset({"README.md", "forecast.json", "vercel.json"})

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


def collect_extra_blobs(include_dir: Path) -> dict[str, bytes]:
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

    blobs: dict[str, bytes] = {}
    for path in sorted(include_dir.glob("*.json")):
        if path.name in RESERVED_BRANCH_FILES:
            # Silently overwriting forecast.json with a station document would
            # be an unusually quiet way to lose the forecast.
            msg = f"{path.name} in {include_dir} collides with a file this script owns"
            raise RefusedError(msg)
        content = path.read_bytes()
        # Refuse rather than publish a file the consumer cannot parse; a stale
        # document keeps the page working, a truncated one does not.
        try:
            json.loads(content)
        except ValueError as exc:
            msg = f"{path.name} in {include_dir} is not valid JSON: {exc}"
            raise RefusedError(msg) from exc
        blobs[path.name] = content

    if not blobs:
        msg = f"--include-dir {include_dir} contains no .json files"
        raise RefusedError(msg)
    return blobs


def build_commit(
    payload: bytes,
    git_dir: Path,
    branch: str,
    issued_at: str,
    extra_blobs: dict[str, bytes] | None = None,
) -> str:
    """Create a bare repo holding one unparented commit with the data tree."""
    env = _git_env(git_dir)
    _git(["init", "--bare", "--quiet", f"--initial-branch={branch}", str(git_dir)], env)

    blobs = {
        "README.md": DATA_BRANCH_README.encode("utf-8"),
        "forecast.json": payload,
        "vercel.json": DATA_BRANCH_VERCEL.encode("utf-8"),
        **(extra_blobs or {}),
    }
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


def read_stamp() -> str | None:
    try:
        return STAMP.read_text(encoding="utf-8").strip() or None
    except OSError:
        return None


def write_stamp(issued_at: str) -> None:
    try:
        STAMP.parent.mkdir(parents=True, exist_ok=True)
        STAMP.write_text(f"{issued_at}\n", encoding="utf-8")
    except OSError as exc:
        # The push already succeeded; a stamp we cannot write only costs us one
        # redundant push next hour.
        _log(f"warning: could not write stamp {STAMP}: {exc}")


def run(
    *,
    source: str | Path = DEFAULT_SOURCE,
    remote: str = DEFAULT_REMOTE,
    branch: str = DEFAULT_BRANCH,
    print_payload: bool = False,
    dry_run: bool = False,
    no_push: bool = False,
    force: bool = False,
    include_dir: str | Path | None = None,
) -> int:
    global _log_stream  # noqa: PLW0603 - one process-wide output channel
    _log_stream = sys.stderr if print_payload else sys.stdout

    try:
        document = load_document(Path(source))
        payload = transform(document, datetime.now(UTC))
        extra_blobs = collect_extra_blobs(Path(include_dir)) if include_dir else {}
    except RefusedError as exc:
        print(f"refusing to publish: {exc}", file=sys.stderr, flush=True)
        return 2

    body = serialise(payload)
    issued_at = payload["issued_at"]

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

    # The skip exists so a failed `predict` does not cost a pointless push. It
    # must not apply when station documents ride along: those advance every
    # minute, so skipping would freeze observations behind a stale forecast --
    # the forecast's own issued_at is what surfaces its staleness in the UI.
    if not force and not extra_blobs and read_stamp() == issued_at:
        _log(f"{issued_at} already published; skipping")
        return 0

    temporary = tempfile.mkdtemp(prefix="grounded-publish.", dir=Path.home() / "Library/Caches")
    try:
        git_dir = Path(temporary) / "repo.git"
        commit = build_commit(body, git_dir, branch, issued_at, extra_blobs)
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

    write_stamp(issued_at)
    _log(
        f"published {issued_at} ({payload['status']}) as {commit[:12]} "
        f"to {branch}: {len(body)} bytes"
        + (f" + {', '.join(sorted(extra_blobs))}" if extra_blobs else "")
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="forecast.json to publish")
    parser.add_argument("--remote", default=DEFAULT_REMOTE, help="git remote to push to")
    parser.add_argument("--branch", default=DEFAULT_BRANCH, help="branch to force-push")
    parser.add_argument("--print", dest="print_payload", action="store_true",
                        help="write the transformed document to stdout")
    parser.add_argument("--dry-run", action="store_true",
                        help="transform only: no git, no network, no stamp")
    parser.add_argument("--no-push", action="store_true",
                        help="build the commit locally but do not push")
    parser.add_argument("--force", action="store_true",
                        help="publish even if issued_at has not advanced")
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
