/// <reference types="vitest/globals" />

declare namespace NodeJS {
  interface ProcessEnv {
    LOCATION_LATITUDE?: string
    LOCATION_LONGITUDE?: string
    REVALIDATE_SECRET?: string
    SITE_URL?: string
    VERCEL_PROJECT_PRODUCTION_URL?: string
    VERCEL_URL?: string
    WEATHER_CURRENT_API_URL?: string
    WEATHER_DAILY_API_URL?: string
    WEATHER_HOURLY_API_URL?: string
  }
}
