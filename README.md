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