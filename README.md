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

### Town homepage document

The publisher also writes `town-card.json` in the same data-branch commit. Schema version 1 supplies the Lake Arrowhead town homepage with explicit station identity and units, timestamped observations, daily rainfall, forecast high/low and outlook, and 24 consecutive UTC-hour entries with fractional rain probability and nested 90%/60%/30% temperature intervals. The window starts at the next full hour at publication time, including across DST transitions; absent hours stay null. Observed rainfall keeps its actual local date. A forecast older than 12 hours is omitted while usable station observations remain available.

`scripts/town_card.py` owns the stdlib-only transformation. Condition thresholds, quantile interpolation, sunrise/sunset, and summary rules follow the UI helpers. The card additionally requires condition evidence and suppresses bands that are not nested, and its next-full-hour UTC window intentionally differs from the UI's current-hour, fixed-local-slot window. Shared document and edge fixtures exercise both Python and the production TypeScript mappers; populated spring/fall fixtures check actual weather values across DST. Run `python3 -m unittest discover -s scripts -t scripts` in addition to `pnpm test`.

Deploy both `publish_forecast.py` and `town_card.py` in the publisher directory, replacing the compatible helper first. Publisher 1.4.3 requires integer `TOWN_CARD_API_VERSION = 1`; compatible helper and publisher releases may differ. A missing or unsupported API marker logs the expected/actual API and helper path, then omits the card without retrying an older call signature. The card is optional: a missing helper or timezone database, invalid station identity or top-level timestamp, or unexpected card error also logs a warning and omits `town-card.json` while the forecast and station documents publish together. Because each commit replaces the branch tree, omission removes any previous card; consumers must handle a missing file as unavailable. Unexpected failures retain their traceback.

Card validation recovers usable data with field-specific warnings: a malformed observation becomes null, invalid selected hourly values leave a gap, and a malformed quantile grid removes only that hour's bands. Rows outside the 24-hour window are ignored before weather-field validation. The last usable hourly duplicate wins; the first daily row matching the publication's local date remains authoritative even when empty or malformed. A point temperature may be null while usable uncertainty bands remain present.

An observation requires a timestamp with a UTC offset and at least one finite exported reading (zero is valid); older readings retain their actual timestamps and local rainfall dates. Forecasts expire strictly after 12 hours, before row validation. A fresh forecast also becomes null if it has no finite high/low, hourly temperature or probability, usable bands, or outlook derived from condition inputs. A sky condition requires at least one finite precipitation amount, rain probability, humidity, or wind speed; zero counts. Temperature-only and bands-only rows remain useful without inventing an outlook. Pressure-, dew-point-, gust-only, and all-null rows cannot invent sky conditions or overwrite an earlier usable hourly duplicate. When neither observation nor forecast remains usable, the card is omitted. The town Worker pulls this public file conditionally; Open Sun needs no town-site credential or outgoing webhook.

### Contract

The forecast publisher accepts grounded-weather-forecast source schemas 5 and
6 and records the actual version in `source_schema_version`. Schema 6 updates
minutely attribution; the published hourly/daily contract remains version 1.
Unknown source versions are refused. Missing station observations remain
nullable.

`lib/forecast-schemas.ts` and `scripts/publish_forecast.py` are two halves of one contract and must change together. Breaking shape changes bump `schema_version` (the consumer asserts it exactly); additive changes and fixes bump `publisher_version` only. The same applies to `lib/schemas.ts` and `scripts/publish_station.py`.

The station documents retain the `aw2sqlite` `/`, `/daily` and `/hourly` fields
and add `rain_total_in` for accumulated rainfall in inches. The station
publisher uses the logger's aggregation functions for other weather fields and
sums increases in the event-rain counter for each station-local day and hour.
Events spanning midnight contribute only new rain to the new day; counter
resets start a new event, and small dips/rebounds do not double-count rain.
Rainfall spanning an outage of more than ten minutes is unknown when it cannot
be assigned to a single day or hour. Unknown/missing totals display a dash,
never an average rate or a made-up zero. Two-hour history rows sum the totals
of their present hourly records. An absent hour record is skipped; if either
present record has an unknown or missing rainfall total, the row displays a
dash. If both hour records are absent, no row is shown. The current observation
card separately labels **Rain today** in inches and **Rain rate** in inches/hour,
with the actual station observation timestamp. This summary appears on Forecast
and History.

The rainfall summary first shows the observation's absolute time and date in
`America/Los_Angeles`. Relative age and freshness appear only after the screen's
shared minute clock is corrected on mount, so a cached page cannot initially
claim an age calculated at regeneration time.
The clock's `hasClientTime` flag records that browser time has been read; it
stays ready across router refreshes. The clock corrects immediately when the
tab becomes visible or the page is restored from the back/forward cache.
Relative age and its warning have reserved
space beneath the absolute timestamp so appearing text does not push the
following content down. This clock updates the age display; it does not fetch
a new observation.
Readings older than two hours are labeled **Older snapshot**. After local
midnight, **Rain today** becomes **Rain on [observation date]** for an older
day's observation, displayed as a readable date such as **Rain on Oct 10, 2026**.
Observation timestamps must be ISO datetimes with `Z` or an explicit timezone
offset. Station and forecast validation share this timestamp rule. Invalid
provided station timestamps are discarded with one structured server warning
containing the rejected value and validation issue path, code, and message,
while usable weather readings remain visible. Missing timestamps are silent.
Missing or invalid observation times
show **Reading time unavailable** and **Rain total**. Timestamps up to five
minutes ahead display **just now**; larger differences are identified as ahead
of the current time. The summary keeps one cadence note; the Info view's
**Station snapshots** card explains that a zero rain rate can still accompany
rainfall already accumulated, station collection runs every minute, dashboard
snapshots are published about hourly, and page caching can add further delay.

`publish_station.py` runs under the aw2sqlite project; the forecast publisher
stays stdlib-only. Two consequences worth knowing:

- **`daily.json` is bounded to eight days and `hourly.json` to the same window.** A published file cannot be re-queried per request, so the publisher bounds it to what the page actually shows; that also keeps `hourly.json` around 60 KB instead of dragging along the station's entire history.
- **`current.json` is the newest stored observation, not a live device read.** The collector writes every 60s, so it is at most a minute old when published — and unlike the live endpoint it does not require the station device to be reachable at publish time. `metadata.observed_at` carries its true timestamp.

Points worth knowing when reading the forecast:

- **Freshness follows the screen's clock.** Forecast and Info warnings
  initially use the server's mapped snapshot so hydration matches first paint.
  They are recalculated from the issue time after the browser clock is corrected,
  on each minute tick, and immediately when the page resumes. Forecasts
  remain fresh through three hours, stale through twelve hours, and expired
  after twelve hours. The Forecast view keeps its absolute update timestamp.
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
publisher_dir="$HOME/Library/Application Support/grounded-weather-forecast"
mkdir -p "$publisher_dir"
# Install the compatible helper before the publisher. Each rename is atomic.
cp scripts/town_card.py "$publisher_dir/town_card.py.next"
mv "$publisher_dir/town_card.py.next" "$publisher_dir/town_card.py"
cp scripts/publish_forecast.py "$publisher_dir/publish_forecast.py.next"
mv "$publisher_dir/publish_forecast.py.next" "$publisher_dir/publish_forecast.py"
cp scripts/publish_station.py "$publisher_dir/publish_station.py"
```

Both need Python 3.12+ and are invoked through `uv` by the `io.github.hbmartin.grounded-predict` LaunchAgent, via `hourly-predict-publish.py`, which runs `predict`, then the station render, then the publish — one process, so nothing races on a non-atomic write and no two jobs can overwrite each other's files on the branch. `publish_forecast.py` is stdlib-only; `publish_station.py` runs under the aw2sqlite project because it imports that project's aggregation functions.

Publisher inputs are resolved at runtime, without volume or home-directory data
defaults. `publish_forecast.py --source PATH` always uses that exact input. When
omitted, it uses `forecast.json` in the working directory, or a validated sibling
`grounded-weather-forecast` checkout when invoked from an `open-sun` checkout.
An active forecast project with missing output never falls back to another
checkout; missing, ambiguous, or malformed discovery inputs are refused with exit
2 before Git runs or the publication stamp changes. Installed copies should run
with the forecast project as their working directory, as the LaunchAgent already
does through `uv --directory`.

`publish_station.py --db PATH` uses the given database. Without it, the script
uses `ambientweather2sqlite`'s existing configuration discovery (working-directory
`aw2sqlite.toml`, then `~/.aw2sqlite.toml`) and configured `database_path`.
Relative database paths follow the collector's working-directory semantics.
Missing or invalid configuration and databases are refused with exit 2 before
documents are written. The hourly wrapper instead passes the absolute database
from the forecast project's `station.db_path`, keeping forecast and station
publication on the same configured observations.

Useful flags: `publish_forecast.py --dry-run --print` inspects a transformed document without touching git, and `--no-push` always builds the commit locally, even for unchanged output, for `git cat-file -p <sha>^{tree}`. `publish_station.py --print` dumps all three station documents to stdout. `forecast.json` includes `publisher_version`, so a stale deployed publisher is visible from the raw URL alone; helper compatibility is reported separately in diagnostics.

Publisher 1.4.3 skips only when the complete meaningful output is unchanged for the exact destination remote/branch pair. Its SHA-256 fingerprint includes the forecast, station bytes, static branch files, and card contents or absence; only the forecast and card's top-level `published_at` fields are ignored. The publisher prepares comparisons directly from the document objects, keeping station bytes intact and parsing each station document once. Window advancement, forecast expiry, changed readings, and card removal/restoration therefore publish even when `issued_at` stays the same. Unchanged runs with `--include-dir` can skip.

Publication state lives beside the legacy `last-published` stamp, under `last-published-states/<destination-id>.json`. The destination ID is SHA-256 of compact JSON containing the exact remote and branch strings. Each versioned record includes that destination and its fingerprint, and is replaced atomically only after a successful push. Alternating destinations retains independent state. Missing, corrupt, unsupported, or mismatched records trigger publication. The old singleton `last-published-state.json` is ignored, so upgrading causes one initial publication per destination; it can be removed after upgrading all installed publishers.

The legacy `last-published` timestamp is reserved for successful pushes to the exact default production pair, `git@github.com:hbmartin/open-sun.git` and `data`. Scratch branches, other remotes, and differently spelled aliases update only their destination-specific fingerprint records. The publisher version bump triggers a new publication; no wire-schema or fingerprint-state migration is needed.

Forecast sources and staged station files use strict JSON parsing: bare `NaN`, `Infinity`, and `-Infinity`, overflowing exponents, and integers too large for a finite floating-point representation refuse the entire run with exit 2 before Git or publication-state updates. This includes source weather values that older publishers could convert to null. Existing nulls remain valid. Diagnostics identify the input file and parsing cause.

`--force` bypasses comparison; dry runs, skipped runs, failed pushes, and `--no-push` leave publication state and the legacy stamp unchanged. `--dry-run` takes precedence over `--no-push` and performs no Git operations. Exit 0 means published (possibly with a card warning) or unchanged output, exit 2 means refused core input (including invalid UTF-8), exit 3 means a Git operation failed, and unexpected core errors retain their traceback and exit 1.

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
