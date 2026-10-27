"""Coordinate-free Lake Arrowhead homepage document. Standard library only.

Condition thresholds, interpolation and summary rules follow the UI helpers.
The card additionally requires condition evidence and nested bands, and uses
a next-full-hour UTC window.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from typing import Any
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Los_Angeles")
TOWN_CARD_API_VERSION = 3
PUBLIC_LOCATION = (34.251, -117.189)
COVERAGES = (0.9, 0.6, 0.3)
# ECMAScript WhiteSpace and LineTerminator characters; Python's strip/float
# accept a different language (including underscores and Unicode digits).
JS_WHITESPACE = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
DECIMAL_KEY = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z")
INDEX_KEY = re.compile(r"(?:0|[1-9][0-9]{0,9})\Z")


class CardInputError(ValueError):
    """An input cannot be represented by the town-card contract."""


def object_value(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise CardInputError(f"{field}: expected an object")
    return value


def number(value: Any) -> float | None:
    if not isinstance(value, (float, int)) or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except OverflowError:
        return None
    return result if math.isfinite(result) else None


def instant(value: Any, field: str = "timestamp") -> datetime:
    if not isinstance(value, str):
        raise CardInputError(f"{field}: expected an ISO timestamp with a UTC offset")
    try:
        at = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if at.tzinfo is None:
            raise ValueError("timestamp requires a timezone")
        return at.astimezone(UTC)
    except (ValueError, OverflowError) as exc:
        raise CardInputError(
            f"{field}: expected an ISO timestamp with a UTC offset"
        ) from exc


def probability_key(key: str) -> float | None:
    """The finite subset of JavaScript Number(string), for JSON object keys."""
    text = key.strip(JS_WHITESPACE)
    if not text:
        return 0.0
    try:
        for prefix, digits, base in (
            ("0x", "[0-9a-fA-F]+", 16),
            ("0b", "[01]+", 2),
            ("0o", "[0-7]+", 8),
        ):
            if text.lower().startswith(prefix):
                return (
                    number(int(text[2:], base))
                    if re.fullmatch(digits, text[2:])
                    else None
                )
        return number(float(text)) if DECIMAL_KEY.fullmatch(text) else None
    except (ValueError, OverflowError):
        return None


def property_order(key: str) -> tuple[int, int]:
    # Object.entries enumerates array-index properties first, in numeric order.
    if INDEX_KEY.fullmatch(key) and int(key) < 2**32 - 1:
        return (0, int(key))
    return (1, 0)


def quantile_at(grid: dict[str, float], probability: float) -> float | None:
    levels = []
    entries = object_value(grid, "quantiles.temp_f").items()
    for key, value in sorted(entries, key=lambda entry: property_order(entry[0])):
        level = probability_key(key)
        numeric = number(value)
        if level is not None and numeric is not None:
            levels.append((level, numeric))
    # Duplicate levels retain Object.entries order, followed by a stable sort.
    levels.sort(key=lambda item: item[0])
    if not levels:
        return None
    for level, value in levels:
        if abs(level - probability) < 1e-9:
            return value
    if probability <= levels[0][0]:
        return levels[0][1]
    if probability >= levels[-1][0]:
        return levels[-1][1]
    for (lp, lv), (hp, hv) in zip(levels, levels[1:]):
        if probability <= hp:
            return lv if hp == lp else lv + (hv - lv) * (probability - lp) / (hp - lp)
    return levels[-1][1]


def bands(grid: dict[str, float]) -> list[dict[str, float]]:
    result = []
    for coverage in COVERAGES:
        tail = (1 - coverage) / 2
        low, high = quantile_at(grid, tail), quantile_at(grid, 1 - tail)
        if low is None or high is None:
            return []
        result.append(
            {"coverage": coverage, "low_f": min(low, high), "high_f": max(low, high)}
        )
    # Crossing quantiles cannot describe nested intervals honestly.
    if any(
        inner["low_f"] < outer["low_f"] or inner["high_f"] > outer["high_f"]
        for outer, inner in zip(result, result[1:])
    ):
        return []
    return result


@lru_cache(maxsize=64)
def station_sun_times(
    day: date, latitude: float, longitude: float
) -> tuple[datetime, datetime]:
    """SunCalc's sunrise/sunset events, anchored like getStationSunTimes.

    Port of the event calculation in lib/suncalc.ts (Vladimir Agafonkin,
    2011-2015). Preserve JS rounding and Date's millisecond truncation.
    """
    rad = math.pi / 180
    anchor = datetime.combine(day, time(12), tzinfo=UTC)
    d = anchor.timestamp() / 86400 - 0.5 + 2440588 - 2451545
    lw, phi = -longitude * rad, latitude * rad
    cycle = math.floor(d - 0.0009 - lw / (2 * math.pi) + 0.5)
    transit = 0.0009 + lw / (2 * math.pi) + cycle
    anomaly = rad * (357.5291 + 0.98560028 * transit)
    center = rad * (
        1.9148 * math.sin(anomaly)
        + 0.02 * math.sin(2 * anomaly)
        + 0.0003 * math.sin(3 * anomaly)
    )
    solar_longitude = anomaly + center + rad * 102.9372 + math.pi
    declination = math.asin(math.sin(solar_longitude) * math.sin(rad * 23.4397))

    def solar_transit(ds: float) -> float:
        # Keep the vendored expression's evaluation order: regrouping the small
        # corrections changes the millisecond produced from a large Julian day.
        return (
            2451545
            + ds
            + 0.0053 * math.sin(anomaly)
            - 0.0069 * math.sin(2 * solar_longitude)
        )

    noon = solar_transit(transit)
    angle = math.acos(
        (math.sin(-0.833 * rad) - math.sin(phi) * math.sin(declination))
        / (math.cos(phi) * math.cos(declination))
    )
    sunset = solar_transit(0.0009 + (angle + lw) / (2 * math.pi) + cycle)
    sunrise = noon - (sunset - noon)

    def from_julian(julian: float) -> datetime:
        milliseconds = math.trunc((julian + 0.5 - 2440588) * 86400000)
        return datetime.fromtimestamp(milliseconds / 1000, UTC)

    return from_julian(sunrise), from_julian(sunset)


def is_daytime(at: datetime, latitude: float, longitude: float) -> bool:
    sunrise, sunset = station_sun_times(at.astimezone(TZ).date(), latitude, longitude)
    return sunrise <= at <= sunset


def condition(values: dict[str, Any], daytime: bool) -> str | None:
    precip = number(values.get("precip_in"))
    pop = number(values.get("pop"))
    humidity = number(values.get("humidity_pct"))
    wind = number(values.get("wind_speed_mph"))
    if all(value is None for value in (precip, pop, humidity, wind)):
        return None
    precip, pop, humidity = precip or 0, (pop or 0) * 100, humidity or 0
    windy = (wind or 0) >= 20
    if precip > 0.01:
        return "rain-wind" if windy else "rain"
    if precip > 0 or pop >= 50:
        return "drizzle"
    if not daytime:
        return "cloudy" if humidity > 85 else "clear-night"
    if windy:
        return "wind"
    if pop >= 30 or humidity > 85:
        return "cloudy"
    if pop >= 15 or humidity > 75:
        return "sun-dim"
    return "sun-medium" if humidity > 60 else "sunny"


def summary(points: list[tuple[datetime, str | None]]) -> str | None:
    phrases = {
        "sunny": "Clear skies",
        "sun-medium": "Mostly sunny",
        "sun-dim": "Hazy sun",
        "cloudy": "Cloudy",
        "drizzle": "A chance of rain",
        "rain": "Rain",
        "rain-wind": "Wind-driven rain",
        "wind": "Windy",
        "clear-night": "Clear skies",
    }
    parts = ["overnight", "this morning", "this afternoon", "this evening"]
    runs: list[tuple[int, list[str]]] = []
    for at, sky in points:
        part = at.astimezone(TZ).hour // 6
        if not runs or runs[-1][0] != part:
            runs.append((part, []))
        if sky is not None:
            runs[-1][1].append(sky)
    if len(runs) < 2:
        return None
    (a, av), (b, bv) = runs[:2]
    if not av or not bv:
        return None
    first = phrases[Counter(av).most_common(1)[0][0]]
    second = phrases[Counter(bv).most_common(1)[0][0]]
    if first == second:
        return f"{first} {parts[a]} and {parts[b]}."
    return f"{first} {parts[a]}, {second.lower()} {parts[b]}."


def build_observation(current: Any) -> dict[str, Any] | None:
    if current is None:
        return None
    current = object_value(current, "current")
    metadata = object_value(current.get("metadata", {}), "current.metadata")
    data = object_value(current.get("data", {}), "current.data")
    observed_at = metadata.get("observed_at")
    if observed_at is None:
        return None
    observed = instant(observed_at, "current.metadata.observed_at")
    readings = {
        "temp_f": number(data.get("outTemp")),
        "wind_mph": number(data.get("avgwind")),
        "gust_mph": number(data.get("gustspeed")),
        "rain_total_in": number(data.get("rain_total_in")),
    }
    if not any(value is not None for value in readings.values()):
        return None
    return {
        "observed_at": observed.isoformat(),
        **readings,
        "rain_date": observed.astimezone(TZ).date().isoformat(),
    }


def product_rows(forecast: dict[str, Any], product: str) -> list[Any]:
    rows = forecast.get(product, [])
    if not isinstance(rows, list):
        raise CardInputError(f"forecast.{product}: expected an array")
    return rows


def build_card_forecast(
    forecast: dict[str, Any],
    published: datetime,
    issued: datetime,
    lat: float,
    lon: float,
    report: Callable[[str], None],
) -> dict[str, Any] | None:
    # Expired rows cannot contribute anything; do not validate unused products.
    if published - issued > timedelta(hours=12):
        return None
    start = published.replace(minute=0, second=0, microsecond=0)
    if start < published:
        start += timedelta(hours=1)
    times = [start + timedelta(hours=i) for i in range(24)]
    wanted = set(times)
    rows = {}
    try:
        hourly = product_rows(forecast, "hourly")
    except CardInputError as exc:
        report(str(exc))
        hourly = []
    for index, raw in enumerate(hourly):
        field = f"forecast.hourly[{index}]"
        try:
            row = object_value(raw, field)
            at = instant(row.get("valid_time"), f"{field}.valid_time")
            if at not in wanted:
                continue
            values = object_value(row.get("values", {}), f"{field}.values")
        except CardInputError as exc:
            report(str(exc))
            continue
        try:
            quantiles = object_value(row.get("quantiles", {}), f"{field}.quantiles")
            grid = object_value(
                quantiles.get("temp_f", {}), f"{field}.quantiles.temp_f"
            )
        except CardInputError as exc:
            report(str(exc))
            grid = {}
        intervals = bands(grid)
        sky = condition(values, is_daytime(at, lat, lon))
        if (
            number(values.get("temp_f")) is not None
            or intervals
            or sky is not None
        ):
            # A malformed/empty duplicate must not erase an earlier usable row.
            rows[at] = (values, intervals, sky)

    daily = {}
    date_local = published.astimezone(TZ).date().isoformat()
    try:
        daily_rows = product_rows(forecast, "daily")
    except CardInputError as exc:
        report(str(exc))
        daily_rows = []
    for index, raw in enumerate(daily_rows):
        field = f"forecast.daily[{index}]"
        try:
            row = object_value(raw, field)
        except CardInputError as exc:
            report(str(exc))
            continue
        if row.get("date_local") != date_local:
            continue
        try:
            daily = object_value(row.get("values", {}), f"{field}.values")
        except CardInputError as exc:
            report(str(exc))
        # The first matching row is authoritative, even when empty or malformed.
        break

    hours, skies = [], []
    for at in times:
        values, intervals, sky = rows.get(at, ({}, [], None))
        hours.append(
            {
                "valid_time": at.isoformat(),
                "temp_f": number(values.get("temp_f")),
                "pop": number(values.get("pop")),
                "bands": intervals,
            }
        )
        skies.append((at, sky))
    high, low = number(daily.get("temp_max_f")), number(daily.get("temp_min_f"))
    outlook = summary(skies)
    if (
        high is None
        and low is None
        and outlook is None
        and not any(
            hour["temp_f"] is not None or hour["pop"] is not None or hour["bands"]
            for hour in hours
        )
    ):
        return None
    return {
        "issued_at": forecast["issued_at"],
        "date_local": date_local,
        "high_f": high,
        "low_f": low,
        "outlook": outlook,
        "hours": hours,
    }


def build_town_card(
    forecast: dict[str, Any],
    current: Any,
    *,
    station_location: tuple[float, float],
    diagnostic: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    forecast = object_value(forecast, "forecast")
    lat, lon = (number(value) for value in station_location)
    if (
        lat is None
        or lon is None
        or abs(lat - PUBLIC_LOCATION[0]) > 0.1
        or abs(lon - PUBLIC_LOCATION[1]) > 0.1
        or forecast.get("timezone") != "America/Los_Angeles"
    ):
        raise CardInputError(
            "forecast.latitude/longitude/timezone: town-card requires the Lake Arrowhead station"
        )
    published = instant(forecast.get("published_at"), "forecast.published_at")
    issued = instant(forecast.get("issued_at"), "forecast.issued_at")
    report = diagnostic if diagnostic is not None else lambda message: None
    try:
        observation = build_observation(current)
    except CardInputError as exc:
        report(str(exc))
        observation = None
    view = build_card_forecast(forecast, published, issued, *PUBLIC_LOCATION, report)
    if observation is None and view is None:
        raise CardInputError("no usable town-card observations or forecast")
    return {
        "schema_version": 2,
        "published_at": published.isoformat(),
        "timezone": "America/Los_Angeles",
        "station": {
            "id": "lake-arrowhead",
            "label": "Lake Arrowhead · North of the Ridge",
        },
        "units": {
            "temperature": "F",
            "wind": "mph",
            "rain": "in",
            "probability": "fraction",
        },
        "observation": observation,
        "forecast": view,
    }
