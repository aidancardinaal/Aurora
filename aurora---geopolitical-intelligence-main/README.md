# Aurora — Conflict Intelligence Dashboard

## Setup
1. Clone the repo
2. Run: `npx serve .`
3. Open http://localhost:3000

## Architecture
- `js/data.js` — market data (swap for live Polymarket API)
- `js/globe.js` — 3D globe via globe.gl
- `js/sidebar.js` — advisor panel + market cards
- `js/ui.js` — forecast toggle, filters, notifications
- `js/main.js` — initialization

## Live API integration
Replace the MARKETS array in data.js with a fetch to:
`GET https://gamma-api.polymarket.com/markets?active=true&order=volume24hr`
Geo-tag markets by parsing country names from market titles.
