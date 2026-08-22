# open-sun data branch

Machine-generated. Do not merge, do not commit here by hand.

`forecast.json` is a published grounded-weather-forecast document (imperial
units, no minutely block) written hourly by `publish_forecast.py`, which lives
at `scripts/publish_forecast.py` on `main` and is deployed to
`~/Library/Application Support/grounded-weather-forecast/`.

`current.json`, `daily.json` and `hourly.json` are station observations,
rendered from the ambientweather2sqlite database by `publish_station.py`
(`scripts/publish_station.py` on `main`) and folded into the same commit. The
station is a LAN device with no route from Vercel, so publishing here is what
lets `app/page.tsx` prerender at build time.

This branch is force-pushed as a single unparented commit each hour, so it has
no history and no diffs -- every file must be rewritten together or the ones
left out are deleted. `vercel.json` here disables deployments for the branch.

The contracts are consumed by `lib/forecast-schemas.ts` and `lib/schemas.ts` on
`main`; publisher and consumer must change together. `publisher_version`
identifies the exact script that produced each document.
