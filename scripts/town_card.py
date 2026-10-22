"""Version-one Lake Arrowhead homepage document. No network or runtime dependencies.

Condition, interpolation and summary rules follow the UI helpers. The card
additionally requires nested bands and uses a next-full-hour UTC window.
"""

from __future__ import annotations

import math
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from typing import Any
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Los_Angeles")
COVERAGES = (0.9, 0.6, 0.3)


class CardInputError(ValueError):
    """An input cannot be represented by the version-one town-card contract."""


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


def quantile_at(grid: dict[str, float], probability: float) -> float | None:
    levels = []
    for key, value in object_value(grid, "quantiles.temp_f").items():
        try:
            level = float(key)
        except (ValueError, TypeError, OverflowError):
            continue
        numeric = number(value)
        if math.isfinite(level) and numeric is not None:
            levels.append((level, numeric))
    # Sort only by probability: duplicate levels retain input order, like JS.
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
    d = anchor.timestamp() / 86400 + 2440587.5 - 2451545
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
    correction = 0.0053 * math.sin(anomaly) - 0.0069 * math.sin(2 * solar_longitude)
    noon = 2451545 + transit + correction
    angle = math.acos(
        (math.sin(-0.833 * rad) - math.sin(phi) * math.sin(declination))
        / (math.cos(phi) * math.cos(declination))
    )
    sunset = 2451545 + (0.0009 + (angle + lw) / (2 * math.pi) + cycle) + correction
    sunrise = noon - (sunset - noon)

    def from_julian(julian: float) -> datetime:
        milliseconds = math.trunc((julian + 0.5 - 2440588) * 86400000)
        return datetime.fromtimestamp(milliseconds / 1000, UTC)

    return from_julian(sunrise), from_julian(sunset)


def is_daytime(at: datetime, latitude: float, longitude: float) -> bool:
    sunrise, sunset = station_sun_times(at.astimezone(TZ).date(), latitude, longitude)
    return sunrise <= at <= sunset


def condition(values: dict[str, Any], daytime: bool) -> str:
    precip = number(values.get("precip_in")) or 0
    pop = (number(values.get("pop")) or 0) * 100
    humidity = number(values.get("humidity_pct")) or 0
    windy = (number(values.get("wind_speed_mph")) or 0) >= 20
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


def build_town_card(
    forecast: dict[str, Any], current: dict[str, Any] | None
) -> dict[str, Any]:
    forecast = object_value(forecast, "forecast")
    lat, lon = number(forecast.get("latitude")), number(forecast.get("longitude"))
    if (
        lat is None
        or lon is None
        or abs(lat - 34.2768) > 0.001
        or abs(lon + 117.1692) > 0.001
        or forecast.get("timezone") != "America/Los_Angeles"
    ):
        raise CardInputError(
            "forecast.latitude/longitude/timezone: town-card requires the Lake Arrowhead station"
        )
    published = instant(forecast.get("published_at"), "forecast.published_at")
    issued = instant(forecast.get("issued_at"), "forecast.issued_at")
    observation = None
    if current is not None:
        current = object_value(current, "current")
        metadata = object_value(current.get("metadata", {}), "current.metadata")
        data = object_value(current.get("data", {}), "current.data")
        observed_at = metadata.get("observed_at")
        if observed_at is not None:
            observed = instant(observed_at, "current.metadata.observed_at")
            readings = {
                "temp_f": number(data.get("outTemp")),
                "wind_mph": number(data.get("avgwind")),
                "gust_mph": number(data.get("gustspeed")),
                "rain_total_in": number(data.get("rain_total_in")),
            }
            if any(value is not None for value in readings.values()):
                observation = {
                    "observed_at": observed.isoformat(),
                    **readings,
                    "rain_date": observed.astimezone(TZ).date().isoformat(),
                }

    # UTC arithmetic gives 24 real hours even when the local clock repeats/skips.
    start = published.replace(minute=0, second=0, microsecond=0)
    if start < published:
        start += timedelta(hours=1)
    rows = {}
    for product in ("hourly", "daily"):
        if not isinstance(forecast.get(product, []), list):
            raise CardInputError(f"forecast.{product}: expected an array")
    for index, raw in enumerate(forecast.get("hourly", [])):
        field = f"forecast.hourly[{index}]"
        row = object_value(raw, field)
        object_value(row.get("values", {}), f"{field}.values")
        quantiles = object_value(row.get("quantiles", {}), f"{field}.quantiles")
        object_value(quantiles.get("temp_f", {}), f"{field}.quantiles.temp_f")
        rows[instant(row.get("valid_time"), f"{field}.valid_time")] = row
    daily = {}
    date_local = published.astimezone(TZ).date().isoformat()
    for index, raw in enumerate(forecast.get("daily", [])):
        field = f"forecast.daily[{index}]"
        row = object_value(raw, field)
        values = object_value(row.get("values", {}), f"{field}.values")
        day = row.get("date_local")
        try:
            date.fromisoformat(day)
        except (TypeError, ValueError) as exc:
            raise CardInputError(f"{field}.date_local: expected an ISO date") from exc
        if day == date_local and not daily:
            daily = values

    hours, skies = [], []
    for i in range(24):
        at = start + timedelta(hours=i)
        row = rows.get(at, {})
        values = row.get("values", {})
        hours.append(
            {
                "valid_time": at.isoformat(),
                "temp_f": number(values.get("temp_f")),
                "pop": number(values.get("pop")),
                "bands": bands(row.get("quantiles", {}).get("temp_f", {})),
            }
        )
        skies.append(
            (at, condition(values, is_daytime(at, lat, lon)) if values else None)
        )
    view = {
        "issued_at": forecast["issued_at"],
        "date_local": date_local,
        "high_f": number(daily.get("temp_max_f")),
        "low_f": number(daily.get("temp_min_f")),
        "outlook": summary(skies),
        "hours": hours,
    }
    if published - issued > timedelta(hours=12):
        view = None
    if observation is None and view is None:
        raise CardInputError("no usable town-card observations or forecast")
    return {
        "schema_version": 1,
        "published_at": published.isoformat(),
        "timezone": "America/Los_Angeles",
        "station": {
            "id": "lake-arrowhead",
            "label": "Lake Arrowhead · North of the Ridge",
            "latitude": lat,
            "longitude": lon,
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
