"""Version-one Lake Arrowhead homepage document. No network or runtime dependencies.

The condition/summary and quantile rules mirror lib/forecast-conditions.ts,
lib/next-hours.ts and lib/quantiles.ts; shared fixture tests guard their parity.
"""
from __future__ import annotations

import math
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Los_Angeles")
COVERAGES = (.9, .6, .3)


def number(value: Any) -> float | None:
    return float(value) if isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value) else None


def instant(value: str) -> datetime:
    at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if at.tzinfo is None:
        raise ValueError("timestamp requires a timezone")
    return at.astimezone(UTC)


def quantile_at(grid: dict[str, float], probability: float) -> float | None:
    levels = sorted((float(k), number(v)) for k, v in grid.items() if number(v) is not None)
    if not levels:
        return None
    if probability <= levels[0][0]:
        return levels[0][1]
    for (lp, lv), (hp, hv) in zip(levels, levels[1:]):
        if probability <= hp:
            return lv + (hv - lv) * (probability - lp) / (hp - lp)
    return levels[-1][1]


def bands(grid: dict[str, float]) -> list[dict[str, float]]:
    result = []
    for coverage in COVERAGES:
        tail = (1 - coverage) / 2
        low, high = quantile_at(grid, tail), quantile_at(grid, 1 - tail)
        if low is None or high is None:
            return []
        result.append({"coverage": coverage, "low_f": min(low, high), "high_f": max(low, high)})
    # Crossing quantiles cannot describe nested intervals honestly.
    if any(inner["low_f"] < outer["low_f"] or inner["high_f"] > outer["high_f"] for outer, inner in zip(result, result[1:])):
        return []
    return result


def is_daytime(at: datetime, latitude: float, longitude: float) -> bool:
    # SunCalc's solar coordinates, using the apparent sunrise altitude (-.833°).
    rad = math.pi / 180
    d = at.timestamp() / 86400 + 2440587.5 - 2451545
    m = rad * (357.5291 + .98560028 * d)
    c = rad * (1.9148 * math.sin(m) + .02 * math.sin(2 * m) + .0003 * math.sin(3 * m))
    longitude_sun = m + c + rad * 102.9372 + math.pi
    e = rad * 23.4397
    declination = math.asin(math.sin(longitude_sun) * math.sin(e))
    right_ascension = math.atan2(math.sin(longitude_sun) * math.cos(e), math.cos(longitude_sun))
    h = rad * (280.16 + 360.9856235 * d + longitude) - right_ascension
    phi = rad * latitude
    altitude = math.asin(math.sin(phi) * math.sin(declination) + math.cos(phi) * math.cos(declination) * math.cos(h))
    return altitude >= -.833 * rad


def condition(values: dict[str, Any], daytime: bool) -> str:
    precip = number(values.get("precip_in")) or 0
    pop = (number(values.get("pop")) or 0) * 100
    humidity = number(values.get("humidity_pct")) or 0
    windy = (number(values.get("wind_speed_mph")) or 0) >= 20
    if precip > .01:
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
    phrases = {"sunny": "Clear skies", "sun-medium": "Mostly sunny", "sun-dim": "Hazy sun", "cloudy": "Cloudy", "drizzle": "A chance of rain", "rain": "Rain", "rain-wind": "Wind-driven rain", "wind": "Windy", "clear-night": "Clear skies"}
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


def build_town_card(forecast: dict[str, Any], current: dict[str, Any] | None) -> dict[str, Any]:
    lat, lon = forecast.get("latitude"), forecast.get("longitude")
    if number(lat) is None or number(lon) is None or abs(lat - 34.2768) > .001 or abs(lon + 117.1692) > .001 or forecast.get("timezone") != "America/Los_Angeles":
        raise ValueError("town-card requires the Lake Arrowhead station")
    published = instant(forecast["published_at"])
    observation = None
    if current and current.get("metadata", {}).get("observed_at"):
        observed = instant(current["metadata"]["observed_at"])
        data = current.get("data", {})
        observation = {"observed_at": observed.isoformat(), "temp_f": number(data.get("outTemp")), "wind_mph": number(data.get("avgwind")), "gust_mph": number(data.get("gustspeed")), "rain_total_in": number(data.get("rain_total_in")), "rain_date": observed.astimezone(TZ).date().isoformat()}
    # UTC arithmetic gives 24 real hours even when the local clock repeats/skips.
    start = published.replace(minute=0, second=0, microsecond=0)
    if start < published:
        start += timedelta(hours=1)
    rows = {instant(row["valid_time"]): row for row in forecast.get("hourly", [])}
    hours, skies = [], []
    for i in range(24):
        at = start + timedelta(hours=i)
        row = rows.get(at, {})
        values = row.get("values", {})
        temp = number(values.get("temp_f"))
        hours.append({"valid_time": at.isoformat(), "temp_f": temp, "pop": number(values.get("pop")), "bands": bands(row.get("quantiles", {}).get("temp_f", {})) if temp is not None else []})
        skies.append((at, condition(values, is_daytime(at, lat, lon)) if values else None))
    date_local = published.astimezone(TZ).date().isoformat()
    daily = next((row.get("values", {}) for row in forecast.get("daily", []) if row.get("date_local") == date_local), {})
    view = {"issued_at": forecast["issued_at"], "date_local": date_local, "high_f": number(daily.get("temp_max_f")), "low_f": number(daily.get("temp_min_f")), "outlook": summary(skies), "hours": hours}
    # Keep fresh observations useful even when a held forecast has expired.
    if published - instant(forecast["issued_at"]) > timedelta(hours=12):
        view = None
    if observation is None and view is None:
        raise ValueError("no usable town-card observations or forecast")
    return {"schema_version": 1, "published_at": published.isoformat(), "timezone": "America/Los_Angeles", "station": {"id": "lake-arrowhead", "label": "Lake Arrowhead · North of the Ridge", "latitude": lat, "longitude": lon}, "units": {"temperature": "F", "wind": "mph", "rain": "in", "probability": "fraction"}, "observation": observation, "forecast": view}
