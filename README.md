# Open Sun

A personal weather-station dashboard built with Next.js. It shows current conditions, a week of daily history, and per-hour detail for each day, along with sunrise/sunset information computed for the station's location. The **Forecast** tab shows a ten-day grounded forecast with uncertainty bands, published from [grounded-weather-forecast](https://github.com/hbmartin/grounded-weather-forecast).

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/hbmartins-projects/v0-open-sun)

## How it works

- `app/page.tsx` is a server component that fetches three station documents — current conditions, daily summaries, and hourly data — plus the forecast (`lib/fetcher.ts`). All four are published files rather than live endpoints; see [the data pipeline](#the-data-pipeline).
- Responses are validated with zod schemas (`lib/schemas.ts`) and mapped into view models (`lib/mappers.ts`) before being handed to the client-side `WeatherApp` component.
- Sun times (sunrise, sunset, twilight phases) are computed locally with a vendored copy of [SunCalc](https://github.com/mourner/suncalc) (`lib/suncalc.ts`) using the configured station coordinates.
- The rendered page is cached by Next.js. A Vercel cron job (see `vercel.json`) hits `GET /api/revalidate?secret=...` hourly, which calls `revalidatePath("/", "layout")` to refresh the cached page.
- The forecast is fetched from the same page render (`fetchForecastData`), validated against `lib/forecast-schemas.ts`, and mapped by `lib/forecast-mappers.ts`. It never throws: if the publisher is down, stale, or emitting an unrecognised shape, the Forecast tab explains why and the rest of the dashboard is unaffected.

## The data pipeline

Nothing here is served by a live API. Every document is **pushed** to the orphan [`data`](https://github.com/hbmartin/open-sun/tree/data) branch of this repository once an hour at `:45`, and open-sun reads it from `raw.githubusercontent.com` at render time; the existing `:00` revalidate cron picks up each new version.

```
grounded-weather-forecast predict ->  publish_forecast.py --include-dir  ->  branch `data`
aw2sqlite.db -> publish_station.py ->  (staged/*.json)  ---^                      |
                                       app/page.tsx  <-  raw.githubusercontent.com
```

Push rather than pull because **the station has no route from a deployed build**. It is a LAN device logged by [`ambientweather2sqlite`](https://github.com/hbmartin/ambientweather2sqlite) on a home Mac, so `localhost:8080` resolves to nothing in Vercel's build container. Since `app/page.tsx` prerenders `/`, that made every deployment fail with `ECONNREFUSED` from the moment ISR landed. Publishing the data instead needs no tunnel, no inbound port, and no always-on exposure of a home service — and the page stays buildable from anywhere, including CI and a laptop with no network path to the station.

The consequence is that freshness is bounded by the publish cadence rather than by request time. That costs nothing here: the page itself only regenerates hourly, so publishing more often than the cron would not change what anyone sees.

Both publishers write into **one commit**, because the branch is force-pushed wholesale as a single unparented commit — anything absent from that tree is deleted from the branch. `publish_station.py` therefore renders into a staging directory and `publish_forecast.py --include-dir` folds the result in. That staging directory persists between runs and is written atomically, so a failed station render republishes the previous hour's observations rather than dropping them.

`main` is never touched by the publishers, and the orphan tree contains no `.github/workflows`, so publishing triggers neither a Vercel build nor a CI run.

### Contract

`lib/forecast-schemas.ts` and `scripts/publish_forecast.py` are two halves of one contract and must change together. Breaking shape changes bump `schema_version` (the consumer asserts it exactly); additive changes and fixes bump `publisher_version` only. The same applies to `lib/schemas.ts` and `scripts/publish_station.py`.

The station documents deliberately keep the exact shape of the `aw2sqlite` `/` , `/daily` and `/hourly` endpoints they replace, so `lib/schemas.ts` and `lib/mappers.ts` are unchanged by the move. `publish_station.py` calls that project's own aggregation functions rather than reimplementing the SQL, which is why it runs under the aw2sqlite project while `publish_forecast.py` stays stdlib-only. Two consequences worth knowing:

- **`daily.json` is bounded to eight days and `hourly.json` to the same window.** A published file cannot be re-queried per request, so the publisher bounds it to what the page actually shows; that also keeps `hourly.json` around 60 KB instead of dragging along the station's entire history.
- **`current.json` is the newest stored observation, not a live device read.** The collector writes every 60s, so it is at most a minute old when published — and unlike the live endpoint it does not require the station device to be reachable at publish time. `metadata.observed_at` carries its true timestamp.

Points worth knowing when reading the forecast:

- **Units are imperial and self-declared.** Every published document carries a `units` block that the zod schema asserts literal-by-literal, so a publisher that started emitting Celsius under `temp_f` would fail validation rather than render 25 as a plausible Fahrenheit reading.
- **`pop` is a fraction in `[0, 1]`**, never a percent. The view model scales it for display.
- **`valid_time` is the start of the clock hour.** Variables whose `truth_semantics` is `mean` (`temp_f`, `humidity_pct`, `dew_point_f`, `wind_speed_mph`) are averages over `[valid_time, valid_time + 1h)`; the rest are instantaneous at `valid_time`. This mirrors the pipeline's own `truth_hourly`, which buckets minute observations with `dt.truncate("1h")`.
- **Values may be `null` or absent, and quantile maps may be empty.** Both mean "no value"; the UI renders a dash rather than a zero.
- **Quantile grids vary in length** — six levels when a point forecast was dressed with residual quantiles, nineteen when the serving method emits a native distribution. Consumers must interpolate (`lib/quantiles.ts`), never index fixed keys. The displayed band is the 80% interval, chosen because p10/p90 are exact members of both grids.
- **`status: "ready"` is a weak guarantee.** It means *some* slice was promoted, not all of them. Per-row `release_ids` is the honest signal, and typically seven of ten daily rows carry none; those days are dimmed and labelled "unvalidated".
- **`issued_at` is the staleness signal.** If the publisher stops, the last document simply ages and the Forecast tab says so.

### Deploying the publishers

`scripts/publish_forecast.py` and `scripts/publish_station.py` are the reviewed sources of truth; the copies that actually run live outside this repository:

```bash
cp scripts/publish_forecast.py scripts/publish_station.py \
   "$HOME/Library/Application Support/grounded-weather-forecast/"
```

Both need Python 3.12+ and are invoked through `uv` by the `io.github.hbmartin.grounded-predict` LaunchAgent, via `hourly-predict-publish.py`, which runs `predict`, then the station render, then the publish — one process, so nothing races on a non-atomic write and no two jobs can overwrite each other's files on the branch. `publish_forecast.py` is stdlib-only; `publish_station.py` runs under the aw2sqlite project because it imports that project's aggregation functions.

Useful flags: `publish_forecast.py --dry-run --print` inspects a transformed document without touching git, and `--no-push` builds the commit locally for `git cat-file -p <sha>^{tree}`. `publish_station.py --print` dumps all three station documents to stdout. `publisher_version` appears in every published document, so a stale deployed copy is visible from the raw URL alone.

## Environment variables

Validated at server startup by `instrumentation.ts` via the zod schema in `lib/environment.ts` — a misconfigured deployment fails immediately rather than on the first request.

| Variable | Required | Description |
| --- | --- | --- |
| `SITE_URL` | No | Public base URL for metadata links, including protocol. Preferred over Vercel system URLs when set. |
| `NEXT_PUBLIC_SITE_URL` | No | Legacy fallback for deployments still configured with the old public site URL variable. Prefer `SITE_URL` for new deployments. |
| `LOCATION_LATITUDE` | Yes | Station latitude (−90 to 90), used for sun-time calculations. |
| `LOCATION_LONGITUDE` | Yes | Station longitude (−180 to 180), used for sun-time calculations. |
| `WEATHER_CURRENT_API_URL` | No | Current conditions. Defaults to `current.json` on the `data` branch. |
| `WEATHER_DAILY_API_URL` | No | Daily aggregates. Defaults to `daily.json` on the `data` branch. |
| `WEATHER_HOURLY_API_URL` | No | Hourly aggregates. Defaults to `hourly.json` on the `data` branch. If the URL carries a query string — which every live `aw2sqlite` endpoint does, for `tz` and `q` — a `start_date` parameter is appended, since the live API requires one and the published file does not. |
| `WEATHER_FORECAST_API_URL` | No | Published forecast document. Defaults to `forecast.json` on the `data` branch. |
| `REVALIDATE_SECRET` | Yes | Shared secret required by `GET /api/revalidate`. |

`SITE_URL` and `NEXT_PUBLIC_SITE_URL` must be full URLs, for example `https://example.com`. If neither is set, metadata links use Vercel's `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL` when available, then fall back to `http://localhost:3000`.

## Development

```bash
pnpm install
pnpm dev
```

By default the dev server reads the same published documents production does, so it needs no station API and works offline of the station's network.

To develop against live station data instead, run the logger with its JSON API enabled — note that `aw2sqlite serve` starts the HTTP server **only** when a port is given, either as `--port` or a `port` key in `aw2sqlite.toml`:

```bash
aw2sqlite serve --port 8080
```

then point the variables at it, keeping the `tz` and `q` query strings (`start_date` is appended for you):

```bash
export WEATHER_CURRENT_API_URL="http://localhost:8080/"
export WEATHER_DAILY_API_URL="http://localhost:8080/daily?tz=America/Los_Angeles&q=min_outTemp&q=avg_outTemp&q=max_outTemp&q=min_outHumi&q=avg_outHumi&q=max_outHumi&q=max_gustspeed&q=min_avgwind&q=max_avgwind&q=avg_avgwind&q=avg_rainofhourly&q=min_uvi&q=avg_uvi&q=max_uvi&q=min_solarrad&q=avg_solarrad&q=max_solarrad"
export WEATHER_HOURLY_API_URL="${WEATHER_DAILY_API_URL/\/daily/\/hourly}"
```

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the dev server. |
| `pnpm build` / `pnpm start` | Production build / serve. |
| `pnpm test` | Run the [Vitest](https://vitest.dev) suite. |
| `pnpm test:watch` | Run tests in watch mode. |
| `pnpm test:coverage` | Run tests with V8 coverage. |
| `pnpm typecheck` | TypeScript type-check (`tsc --noEmit`). |
| `pnpm lint` | [oxlint](https://oxc.rs/docs/guide/usage/linter) checks + [oxfmt](https://oxc.rs/docs/guide/usage/formatter) format check. |
| `pnpm lf` | oxlint autofix, then oxfmt. |
| `pnpm format` | Rewrite files with oxfmt. |

## On-demand revalidation

To refresh the cached page immediately (outside the hourly cron):

```bash
curl "https://your-app.vercel.app/api/revalidate?secret=YOUR_SECRET"
```

Returns `200` with a timestamp on success, `401` for a missing or incorrect secret.
