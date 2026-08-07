import { z } from "zod"

const optionalUrlSchema = z.string().url().optional()

const siteUrlSchema = z.object({
  SITE_URL: optionalUrlSchema,
  NEXT_PUBLIC_SITE_URL: optionalUrlSchema,
})

const appUrlSchema = siteUrlSchema.extend({
  VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
  VERCEL_URL: z.string().min(1).optional(),
})

// Every data source is published hourly to the orphan `data` branch: the
// station documents by scripts/publish_station.py, the forecast by
// scripts/publish_forecast.py, both folded into one commit.
//
// The station is a LAN device behind aw2sqlite on a home Mac, so a deployed
// build has no route to it -- pointing these at localhost is what made every
// Vercel deployment fail to prerender `/` after ISR landed. Reading the
// published copy instead keeps the page buildable from anywhere.
//
// These default rather than being optional so existing deployments need no new
// configuration and instrumentation.ts still validates at boot. Point them at a
// running `aw2sqlite serve --port 8080` for development; see the README.
const DATA_BRANCH = "https://raw.githubusercontent.com/hbmartin/open-sun/data"

const environmentSchema = siteUrlSchema.extend({
  WEATHER_CURRENT_API_URL: z.string().url().default(`${DATA_BRANCH}/current.json`),
  WEATHER_DAILY_API_URL: z.string().url().default(`${DATA_BRANCH}/daily.json`),
  WEATHER_HOURLY_API_URL: z.string().url().default(`${DATA_BRANCH}/hourly.json`),
  WEATHER_FORECAST_API_URL: z.string().url().default(`${DATA_BRANCH}/forecast.json`),
  LOCATION_LATITUDE: z.coerce.number().min(-90).max(90),
  LOCATION_LONGITUDE: z.coerce.number().min(-180).max(180),
  REVALIDATE_SECRET: z.string().min(1),
})

export type Environment = z.infer<typeof environmentSchema>
type SiteUrlEnvironment = z.infer<typeof siteUrlSchema>
type AppUrlEnvironment = z.infer<typeof appUrlSchema>

let cachedEnvironment: Environment | undefined

export function getEnvironment(): Environment {
  if (cachedEnvironment) {
    return cachedEnvironment
  }
  const _cachedEnvironment = environmentSchema.parse(process.env)
  cachedEnvironment = _cachedEnvironment
  return _cachedEnvironment
}

export function getConfiguredSiteUrl(
  environment: SiteUrlEnvironment = siteUrlSchema.parse(process.env),
): string | undefined {
  return environment.SITE_URL ?? environment.NEXT_PUBLIC_SITE_URL
}

export function getAppUrl(
  environment: AppUrlEnvironment = appUrlSchema.parse(process.env),
): string {
  const configuredUrl = getConfiguredSiteUrl(environment)
  if (configuredUrl) {
    return configuredUrl
  }

  // Vercel's *_URL system vars contain domains, despite the suffix.
  const vercelDomain = environment.VERCEL_PROJECT_PRODUCTION_URL ?? environment.VERCEL_URL
  if (vercelDomain) {
    return `https://${vercelDomain}`
  }

  return "http://localhost:3000"
}
