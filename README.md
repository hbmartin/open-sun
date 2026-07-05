# Open Sun

A personal weather-station dashboard built with Next.js. It shows current conditions, a week of daily history, and per-hour detail for each day, along with sunrise/sunset information computed for the station's location.

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/hbmartins-projects/v0-open-sun)

## How it works

- `app/page.tsx` is a server component that fetches three endpoints from a weather-station API at request time: current conditions, daily summaries, and hourly data (`lib/fetcher.ts`).
- Responses are validated with zod schemas (`lib/schemas.ts`) and mapped into view models (`lib/mappers.ts`) before being handed to the client-side `WeatherApp` component.
- Sun times (sunrise, sunset, twilight phases) are computed locally with a vendored copy of [SunCalc](https://github.com/mourner/suncalc) (`lib/suncalc.ts`) using the configured station coordinates.
- The rendered page is cached by Next.js. A Vercel cron job (see `vercel.json`) hits `GET /api/revalidate?secret=...` hourly, which calls `revalidatePath("/", "layout")` to refresh the cached page.

## Environment variables

Validated at server startup by `instrumentation.ts` via the zod schema in `lib/environment.ts` — a misconfigured deployment fails immediately rather than on the first request.

| Variable | Required | Description |
| --- | --- | --- |
| `SITE_URL` | No | Public base URL for metadata links, including protocol. Preferred over Vercel system URLs when set. |
| `NEXT_PUBLIC_SITE_URL` | No | Legacy fallback for deployments still configured with the old public site URL variable. Prefer `SITE_URL` for new deployments. |
| `LOCATION_LATITUDE` | Yes | Station latitude (−90 to 90), used for sun-time calculations. |
| `LOCATION_LONGITUDE` | Yes | Station longitude (−180 to 180), used for sun-time calculations. |
| `WEATHER_CURRENT_API_URL` | No | Endpoint for current conditions. Defaults to `http://localhost:8080/`. |
| `WEATHER_DAILY_API_URL` | No | Endpoint for daily aggregates. Defaults to a `localhost:8080/daily.json` query. |
| `WEATHER_HOURLY_API_URL` | No | Endpoint for hourly aggregates. Defaults to a `localhost:8080/hourly.json` query. When the URL points at localhost, a `start_date` query parameter is appended. |
| `REVALIDATE_SECRET` | Yes | Shared secret required by `GET /api/revalidate`. |

`SITE_URL` and `NEXT_PUBLIC_SITE_URL` must be full URLs, for example `https://example.com`. If neither is set, metadata links use Vercel's `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL` when available, then fall back to `http://localhost:3000`.

## Development

```bash
pnpm install
pnpm dev
```

The dev server expects a weather-station API on `localhost:8080` (or set the `WEATHER_*_API_URL` variables to point elsewhere).

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the dev server. |
| `pnpm build` / `pnpm start` | Production build / serve. |
| `pnpm test` | Run the [Vitest](https://vitest.dev) suite. |
| `pnpm test:watch` | Run tests in watch mode. |
| `pnpm test:coverage` | Run tests with V8 coverage. |
| `pnpm typecheck` | TypeScript type-check (`tsc --noEmit`). |
| `pnpm lint` | ESLint + Biome checks. |
| `pnpm lf` | ESLint + Biome with autofix. |

## On-demand revalidation

To refresh the cached page immediately (outside the hourly cron):

```bash
curl "https://your-app.vercel.app/api/revalidate?secret=YOUR_SECRET"
```

Returns `200` with a timestamp on success, `401` for a missing or incorrect secret.
