import type { RangeObservation, WeatherCondition } from "@/lib/types.ts"

export function mapWeatherToCondition(data: RangeObservation): WeatherCondition {
    const { avg_outHumi: humidity, avg_avgwind: windSpeed, avg_solarrad: solarRadiation, avg_uvi: uvIndex, avg_rainofhourly: hourlyRainRate } = data
    
    // Determine if it's nighttime based on solar radiation and UV index
    const isNighttime = solarRadiation < 10 && uvIndex === 0
    
    // Precipitation thresholds (based on NWS definitions)
    const isDrizzle = hourlyRainRate > 0 && hourlyRainRate <= 0.01
    const isLightRain = hourlyRainRate > 0.01 && hourlyRainRate <= 0.1
    const isRain = hourlyRainRate > 0.1
    
    const isWindy = windSpeed >= 20
    
    // Solar radiation thresholds for cloud cover estimation
    // Clear day typically has ~800-1000 W/m² at peak
    // These thresholds are adjusted based on typical patterns
    const clearSkyRadiation = solarRadiation > 700
    const partlySunnyRadiation = solarRadiation > 400 && solarRadiation <= 700
    const mostlyCloudyRadiation = solarRadiation > 200 && solarRadiation <= 400
    const cloudyRadiation = solarRadiation <= 200
    
    // UV Index categories (based on WHO/EPA standards)
    const uvLow = uvIndex >= 0 && uvIndex <= 2
    const uvModerate = uvIndex >= 3 && uvIndex <= 5
    const uvHigh = uvIndex >= 6 && uvIndex <= 7
    const uvVeryHigh = uvIndex >= 8
    
    // First, check for precipitation
    if (isRain || isLightRain) {
      if (isWindy) {
        return "rain-wind"
      }
      return "rain"
    }
    
    if (isDrizzle) {
      return "drizzle"
    }
    
    // Check for nighttime conditions
    if (isNighttime) {
      // For night, we mainly consider cloud cover through humidity
      // High humidity at night often indicates cloud cover
      if (humidity > 85) {
        return "cloudy"
      }
      return "clear-night"
    }
    
    // Daytime conditions without precipitation
    
    // Check for windy conditions without rain
    if (isWindy && !clearSkyRadiation) {
      return "wind"
    }
    
    // Classify based on solar radiation and UV index
    if (cloudyRadiation || (uvIndex < 1 && solarRadiation < 100)) {
      return "cloudy"
    }
    
    if (mostlyCloudyRadiation || (uvLow && solarRadiation < 400)) {
      return "sun-dim"
    }
    
    if (partlySunnyRadiation || (uvModerate && solarRadiation < 700)) {
      return "sun-medium"
    }
    
    if (clearSkyRadiation || uvHigh || uvVeryHigh) {
      return "sunny"
    }
    
    // Default fallback based on combined factors
    if (solarRadiation > 500 && uvIndex > 3) {
      return "sun-medium"
    } else if (solarRadiation > 200) {
      return "sun-dim"
    } else {
      return "cloudy"
    }
}
  