# Simple weather app

*Automatically synced with your [v0.dev](https://v0.dev) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/hbmartins-projects/v0-open-sun)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.dev-black?style=for-the-badge)](https://v0.dev/chat/projects/HCj0uARiv04)

## Overview

This repository will stay in sync with your deployed chats on [v0.dev](https://v0.dev).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.dev](https://v0.dev).

## Deployment

Your project is live at:

**[https://vercel.com/hbmartins-projects/v0-open-sun](https://vercel.com/hbmartins-projects/v0-open-sun)**

## Build your app

Continue building your app on:

**[https://v0.dev/chat/projects/HCj0uARiv04](https://v0.dev/chat/projects/HCj0uARiv04)**

## How It Works

1. Create and modify your project using [v0.dev](https://v0.dev)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## Incremental Static Regeneration (ISR)

This weather app implements ISR to optimize performance and reduce API calls in production while maintaining real-time data freshness.

### Architecture Overview

The app uses a dual-mode data fetching strategy:

**Development Mode (`NODE_ENV=development`):**
- Direct API calls to `localhost:8080` for real-time data
- No caching or static generation
- Ideal for development and testing

**Production Mode (Vercel deployment):**
- Static JSON files served from `/data` directory
- ISR with 1-hour automatic revalidation
- On-demand revalidation for immediate updates
- Significantly faster page loads and reduced API overhead

### Static Data Structure

The following static files are generated:

```
data/
├── current.json          # Current weather conditions
├── daily.json           # Week-long daily weather data
├── hourly-YYYY-MM-DD.json # Hourly data for specific dates
└── ...
```

### ISR Configuration

**Automatic Time-based Revalidation:**
- Pages revalidate every hour (`revalidate = 3600`)
- Stale data is served while fresh data is generated in background
- Zero downtime updates

**Cache Tags:**
- `current-weather` - Current conditions
- `daily-weather` - Weekly forecast
- `hourly-weather-{date}` - Hourly data for specific dates

### On-Demand Revalidation

For immediate data updates without waiting for the hourly revalidation:

#### Setup Environment Variable

Add to your Vercel environment variables:
```
REVALIDATE_SECRET=your-secure-random-string
```

#### API Endpoint

**POST** `/api/revalidate?secret=YOUR_SECRET`

#### Request Examples

**Update Current Weather:**
```bash
curl -X POST "https://your-app.vercel.app/api/revalidate?secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "current",
    "data": {
      "temperature": 25.5,
      "humidity": 65,
      "pressure": 1013.25,
      "windSpeed": 12.5,
      "windDirection": 180,
      "condition": "partly-cloudy"
    }
  }'
```

**Update Daily Forecast:**
```bash
curl -X POST "https://your-app.vercel.app/api/revalidate?secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "daily",
    "data": [
      {
        "date": "2024-01-01",
        "minTemp": 18.2,
        "maxTemp": 28.7,
        "condition": "sunny"
      }
    ]
  }'
```

**Update Hourly Data:**
```bash
curl -X POST "https://your-app.vercel.app/api/revalidate?secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "hourly",
    "date": "2024-01-01",
    "data": [
      {
        "time": "2024-01-01T00:00:00Z",
        "temperature": 22.1,
        "humidity": 58,
        "condition": "clear"
      }
    ]
  }'
```

#### Response Format

**Success (200):**
```json
{
  "message": "Revalidated successfully",
  "type": "current",
  "date": null,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Error (401):**
```json
{
  "message": "Invalid secret"
}
```

### Build Process

The production build automatically generates initial static data:

```bash
npm run build
# Runs: npm run generate-static-data && next build
```

This ensures fresh data is available immediately upon deployment.

### Benefits

1. **Performance**: Static files load instantly
2. **Reliability**: No dependency on external APIs during page loads
3. **Scalability**: Handles high traffic without API rate limits
4. **Freshness**: Automatic hourly updates + on-demand revalidation
5. **Cost Efficiency**: Reduced API calls and serverless function executions

### Monitoring

Monitor revalidation events through:
- Vercel deployment logs
- Custom analytics on the `/api/revalidate` endpoint
- Next.js built-in analytics for ISR cache hits/misses