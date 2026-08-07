import type { ForecastHourData, WeatherCondition } from "@/lib/types"

/**
 * Sky conditions for forecast rows.
 *
 * The station-history equivalent in lib/weather-conditions.ts infers sky state
 * from solar radiation and UV index. The forecast carries neither, so this
 * reads probability of precipitation as the cloud proxy and takes day/night
 * from computed sun times rather than inferring darkness from a dim sensor.
 *
 * Deliberately reuses the WeatherCondition union, so WeatherIcon's icon and
 * colour map serves forecast rows with no additions.
 */

export interface ForecastConditionInput {
  /** Percent, 0-100, as carried on the view model. */
  pop?: number
  /** Inches. */
  precip?: number
  humidity?: number
  /** Miles per hour. */
  wind?: number
  isDaytime: boolean
}

// Matching lib/weather-conditions.ts so the two read alike.
const WINDY_MPH = 20
const DRIZZLE_MAX_IN = 0.01
const LIGHT_RAIN_MAX_IN = 0.1
const OVERCAST_HUMIDITY = 85
const HAZY_HUMIDITY = 75
const SOFT_HUMIDITY = 60

export function mapForecastToCondition({
  pop = 0,
  precip = 0,
  humidity = 0,
  wind = 0,
  isDaytime,
}: ForecastConditionInput): WeatherCondition {
  const isWindy = wind >= WINDY_MPH

  // Precipitation first, as in the history mapper.
  if (precip > LIGHT_RAIN_MAX_IN) {
    return isWindy ? "rain-wind" : "rain"
  }
  if (precip > DRIZZLE_MAX_IN) {
    return isWindy ? "rain-wind" : "rain"
  }
  // A forecast can carry a high chance of rain with no accumulation predicted;
  // showing that as sunshine would be the wrong story.
  if (precip > 0 || pop >= 50) {
    return "drizzle"
  }

  if (!isDaytime) {
    return humidity > OVERCAST_HUMIDITY ? "cloudy" : "clear-night"
  }

  if (isWindy) {
    return "wind"
  }

  if (pop >= 30 || humidity > OVERCAST_HUMIDITY) {
    return "cloudy"
  }
  if (pop >= 15 || humidity > HAZY_HUMIDITY) {
    return "sun-dim"
  }
  if (humidity > SOFT_HUMIDITY) {
    return "sun-medium"
  }
  return "sunny"
}

/** The gradient stripe colour for one hour, mirroring mapWeatherToColor. */
export function mapForecastToColor(hour: ForecastHourData): string {
  const { pop = 0, precip = 0, humidity = 0, isDaytime } = hour

  if (precip > 0 && precip <= DRIZZLE_MAX_IN) {
    return "#cdf6ff"
  }
  if (precip > DRIZZLE_MAX_IN && precip <= LIGHT_RAIN_MAX_IN) {
    return "#77c0ed"
  }
  if (precip > LIGHT_RAIN_MAX_IN) {
    return "#3b8bb5"
  }
  if (isDaytime && pop < 15) {
    return "#ffd49b"
  }
  if (isDaytime && pop < 40) {
    return "#ffeab3"
  }
  if (humidity > OVERCAST_HUMIDITY) {
    return "#B8B8B8"
  }
  return "#EBEBED"
}
