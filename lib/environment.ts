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

const environmentSchema = siteUrlSchema.extend({
  WEATHER_CURRENT_API_URL: z
    .string()
    .url()
    .default("http://localhost:8080/"),
  WEATHER_DAILY_API_URL: z
    .string()
    .url()
    .default(
      "http://localhost:8080/daily.json?tz=America/Los_Angeles&q=min_outTemp&q=max_outTemp" +
      "&q=avg_outTemp&q=min_outHumi&q=avg_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind" +
      "&q=avg_uvi&q=avg_solarrad&q=avg_rainofhourly&q=min_avgwind&q=max_avgwind" +
      "&q=min_uvi&q=max_uvi&q=min_solarrad&q=max_solarrad",
    ),
  WEATHER_HOURLY_API_URL: z
    .string()
    .url()
    .default(
      "http://localhost:8080/hourly.json?tz=America/Los_Angeles&q=min_outTemp&q=max_outTemp&q=min_outHumi&q=max_outHumi&q=avg_avgwind&q=max_gustspeed&q=avg_rainofhourly&q=avg_outHumi&q=avg_outTemp&q=avg_uvi&q=avg_solarrad&q=min_avgwind&q=max_avgwind&q=min_uvi&q=max_uvi&q=min_solarrad&q=max_solarrad",
    ),
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
  const vercelDomain =
    environment.VERCEL_PROJECT_PRODUCTION_URL ?? environment.VERCEL_URL
  if (vercelDomain) {
    return `https://${vercelDomain}`
  }

  return "http://localhost:3000"
}
