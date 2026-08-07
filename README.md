# Open Sun

A personal weather-station dashboard built with Next.js. It shows current conditions, a week of daily history, and per-hour detail for each day, along with sunrise/sunset information computed for the station's location. The **Forecast** tab shows a ten-day grounded forecast with uncertainty bands, published from [grounded-weather-forecast](https://github.com/hbmartin/grounded-weather-forecast).

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/hbmartins-projects/v0-open-sun)

## How it works

- `app/page.tsx` is a server component that fetches three endpoints from a weather-station API at request time: current conditions, daily summaries, and hourly data (`lib/fetcher.ts`).
- Responses are validated with zod schemas (`lib/schemas.ts`) and mapped into view models (`lib/mappers.ts`) before being handed to the client-side `WeatherApp` component.
- Sun times (sunrise, sunset, twilight phases) are computed locally with a vendored copy of [SunCalc](https://github.com/mourner/suncalc) (`lib/suncalc.ts`) using the configured station coordinates.
- The rendered page is cached by Next.js. A Vercel cron job (see `vercel.json`) hits `GET /api/revalidate?secret=...` hourly, which calls `revalidatePath("/", "layout")` to refresh the cached page.
- The forecast is fetched from the same page render (`fetchForecastData`), validated against `lib/forecast-schemas.ts`, and mapped by `lib/forecast-mappers.ts`. It never throws: if the publisher is down, stale, or emitting an unrecognised shape, the Forecast tab explains why and the rest of the dashboard is unaffected.

## The forecast pipeline

The forecast is **not** served by an API. `scripts/publish_forecast.py` runs on the machine that produces the forecast, once an hour at `:45`, and force-pushes a single unparented commit to the orphan [`data`](https://github.com/hbmartin/open-sun/tree/data) branch of this repository. open-sun reads it from `raw.githubusercontent.com` at render time, and the existing `:00` revalidate cron picks up each new document.

```
grounded-weather-forecast predict  ->  publish_forecast.py  ->  branch `data`
                                                                     |
                              app/page.tsx  <-  raw.githubusercontent.com
```

`main` is never touched by the publisher, and the orphan tree contains no `.github/workflows`, so publishing triggers neither a Vercel build nor a CI run.

### Contract

`lib/forecast-schemas.ts` and `scripts/publish_forecast.py` are two halves of one contract and must change together. Breaking shape changes bump `schema_version` (the consumer asserts it exactly); additive changes and fixes bump `publisher_version` only.

Points worth knowing when reading the data:

- **Units are imperial and self-declared.** Every published document carries a `units` block that the zod schema asserts literal-by-literal, so a publisher that started emitting Celsius under `temp_f` would fail validation rather than render 25 as a plausible Fahrenheit reading.
- **`pop` is a fraction in `[0, 1]`**, never a percent. The view model scales it for display.
- **`valid_time` is the start of the clock hour.** Variables whose `truth_semantics` is `mean` (`temp_f`, `humidity_pct`, `dew_point_f`, `wind_speed_mph`) are averages over `[valid_time, valid_time + 1h)`; the rest are instantaneous at `valid_time`. This mirrors the pipeline's own `truth_hourly`, which buckets minute observations with `dt.truncate("1h")`.
- **Values may be `null` or absent, and quantile maps may be empty.** Both mean "no value"; the UI renders a dash rather than a zero.
- **Quantile grids vary in length** — six levels when a point forecast was dressed with residual quantiles, nineteen when the serving method emits a native distribution. Consumers must interpolate (`lib/quantiles.ts`), never index fixed keys. The displayed band is the 80% interval, chosen because p10/p90 are exact members of both grids.
- **`status: "ready"` is a weak guarantee.** It means *some* slice was promoted, not all of them. Per-row `release_ids` is the honest signal, and typically seven of ten daily rows carry none; those days are dimmed and labelled "unvalidated".
- **`issued_at` is the staleness signal.** If the publisher stops, the last document simply ages and the Forecast tab says so.

### Deploying the publisher

`scripts/publish_forecast.py` is the reviewed source of truth; the copy that actually runs lives outside this repository:

```bash
cp scripts/publish_forecast.py "$HOME/Library/Application Support/grounded-weather-forecast/"
```

It is stdlib-only but needs Python 3.12+, and is invoked through `uv` by the `io.github.hbmartin.grounded-predict` LaunchAgent (via `hourly-predict-publish.py`, which runs `predict` first so the two cannot race on a non-atomic write). Run `--dry-run --print` to inspect a transformed document without touching git, and `--no-push` to build the commit locally. `publisher_version` appears in every published document, so a stale deployed copy is visible from the raw URL alone.

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
| `WEATHER_FORECAST_API_URL` | No | Published forecast document. Defaults to the `data` branch on raw.githubusercontent. |
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
