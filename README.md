# TaiwanExplorer

## Introduction
TaiwanExplorer is an interactive geographic exploration platform designed to provide users with a comprehensive view of Taiwan's counties and places of interest. The application utilizes Leaflet for map rendering and offers features such as zooming, panning, and filtering by categories.

## Tech Stack
- Angular (latest stable version)
- TypeScript
- SCSS
- Leaflet
- GeoJSON

## Rendering and Hosting
The application uses client-side rendering (CSR). Its browser entry point is `src/main.ts`, which bootstraps `AppModule`. Server-side rendering (SSR) and prerendering are not configured, and no Node.js server is required for hosting the built site.

Run `npm run build` to generate the static site in `dist/TaiwanExplorer`. Publish that directory to a static host such as GitHub Pages. Node.js is only needed for local development and build tooling.

## Location
Mobile devices request high-accuracy browser geolocation while the page is open. Desktop browsers, and devices where geolocation is unavailable or denied, use approximate IP geolocation from [GeoJS](https://www.geojs.io/docs/v1/endpoints/geo/). Device coordinates stay in the browser; the IP lookup does not send GPS coordinates to GeoJS.

The blue dot shows the device or IP position, with an accuracy circle when available. Dragging the map does not enable automatic camera following; the return-to-location button centers the latest position while preserving the current zoom. The initial and failed-location view centers on Taichung Station. This fallback is not shown as the user's current location, and failed requests can be retried.

## Project Structure
```
src/
├── app/
│   ├── components/
│   ├── core/
│   ├── features/
│   ├── models/
│   ├── app.component.ts
│   ├── app.component.html
│   ├── app.component.scss
│   ├── app.config.ts
│   └── app.routes.ts
├── assets/
│   ├── data/
│   └── geojson/
├── index.html
├── main.ts
└── styles.scss
```

## Installation
To set up the project, follow these steps:

1. Clone the repository:
   ```
   git clone <repository-url>
   cd TaiwanExplorer
   ```

2. Install the dependencies:
   ```
   npm install
   ```

3. Run the application:
   ```
   ng serve
   ```

## GeoJSON Setup
Place the GeoJSON files for Taiwan's counties in the following directory:
```
src/assets/geojson/taiwan-counties.geojson
src/assets/geojson/taiwan-districts.geojson
```

## Place Data
Mock place data should be structured according to the `Place` interface and placed in:
```
src/assets/data/places.json
```

## Map Architecture
The map is initialized in the `TaiwanMapComponent`, which loads the GeoJSON data and manages user interactions. The map supports zoom levels that determine the visibility of counties and places.

## Zoom Strategy
The application defines zoom levels for different views:
- Level 1: Taiwan view (counties visible)
- Level 2: County view (districts can be loaded)
- Level 3: Places view (individual places marked)

## Future API
The application is designed to support future integration with a backend API, allowing for dynamic data retrieval and management.

## Future Database
The database will include comprehensive details about places, including attributes such as name, category, coordinates, and descriptions.

## Future Features
### Phase 1
- Taiwan Map
- County
- Zoom
- Hover
- Click
- Place Marker
- Category Filter

### Phase 2
- District
- Search
- Place Detail
- Photos
- Tags

### Phase 3
- Backend API
- Oracle Database
- Place Management
- Admin

### Phase 4
- Favorites
- Travel Collection
- Travel Route
- Nearby Places
- Recommendation
## Personal Place Records

Connect Google Drive, create the private records dataset once, then open “我的地點紀錄／編輯” from a place popup or list. Save 1–5 stars (or unrated), visited, parking, seasonal status and an optional seasonal explanation. Unknown values remain unset. Only the connected account sees its personal records; the public map works without login.

This adapts Home bookmarks' Drive/session/login engines (source: ../Home/apps/bookmarks/Javascript, snapshot 2026-10-29). Angular remains CSR; there is no storage server. Records use purpose melody-taiwan-records-v1, a separate private TaiwanExplorer folder and place-records-YYYY-MM-DD.json files in Taiwan time. Bookmarks files are never read or written. Same-day updates use conditional writes; new days preserve earlier files. Conflicts require an explicit version choice.

The public OAuth Client ID in src/assets/records/config.js matches Home bookmarks. Enable Drive API and authorize https://melodypan.github.io as a JavaScript origin in that existing Google project. Local testing requires adding the actual localhost origin (including port). No Client Secret belongs in the site. Scope is drive.file; tokens stay in this tab's sessionStorage under a separate key and expire according to Google's expires_in. Personal records and unsaved drafts stay in memory, not localStorage.

Use “下載備份” before leaving if synchronization fails. Closing and reopening the editor retains its draft within the current tab. Reloading or closing the tab loses unsubmitted edits; the site warns before leaving. Reconnect the same account after expiration. “重新同步” refreshes cloud data; if the open form is stale, save is blocked until you explicitly reload that place.

Run node --test tests/*.test.cjs and npm run build -- --base-href /TaiwanExplorer/. Mocked tests cover schema validation, Drive versioning, uncertain responses, authorization expiry, account changes, and stale editor writes. Real Google authorization and iPhone popup recovery must also be accepted on an actual account; mocked tests cannot prove Google project policy or device behavior.
