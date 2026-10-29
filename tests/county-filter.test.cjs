const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { of } = require('rxjs');

// Only Angular metadata and Leaflet's browser rendering are replaced.
// Filtering, observable updates, and component interactions run real source.
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, experimentalDecorators: true }
  }).outputText;
  const localRequire = name => {
    if (name === '@angular/core') return { Injectable: () => value => value, Component: () => value => value, Inject: () => () => {} };
    if (name === '@angular/common') return { DOCUMENT: 'DOCUMENT', CommonModule: class {} };
    if (name.startsWith('src/')) return load(name + '.ts');
    if (name === 'leaflet') return {
      divIcon: options => options,
      point: (x, y) => ({ x, y }),
      marker: coordinates => ({
        bindPopup(content, options) { this.popup = { getContent: () => content, options }; return this; },
        getPopup() { return this.popup; },
        bindTooltip(content) { this.tooltip = content; return this; },
        setTooltipContent(content) { this.tooltip = content; return this; },
        setLatLng(point) { this.point = point; return this; },
        addTo(map) { map.visible.push(coordinates); this.map = map; return this; },
        remove() { this.map.visible.splice(this.map.visible.indexOf(coordinates), 1); }
      })
    };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name + '.ts'));
    return require(name);
  };
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename })(localRequire, module, module.exports);
  return module.exports;
}
const { PlaceMarkerService } = load('src/app/core/services/place-marker.service.ts');
const { PlaceListComponent } = load('src/app/components/place-list/place-list.component.ts');
const { SidebarComponent } = load('src/app/components/sidebar/sidebar.component.ts');
const places = [
  { id: 1, name: '臺中咖啡', county: '臺中市', district: '中區', category: 'CAFE', latitude: 24, longitude: 120 },
  { id: 2, name: '臺南咖啡', county: '臺南市', district: '中西區', category: 'CAFE', latitude: 23, longitude: 120 },
  { id: 3, name: '臺北咖啡', county: '臺北市', district: '中正區', category: 'CAFE', latitude: 25, longitude: 121 },
  { id: 4, name: '臺中景點', county: '臺中市', district: '西區', category: 'ATTRACTION', latitude: 24.1, longitude: 120 }
];
function setup() {
  const data = { getPlaces: () => of(places) };
  const filters = new PlaceMarkerService(data);
  const list = new PlaceListComponent(data, filters);
  list.ngOnInit();
  const map = { visible: [], getZoom: () => 10, getBounds: () => ({ contains: () => true }) };
  filters.loadMarkers(map);
  return { filters, list, map };
}
test('multiple counties include either county and update both list and markers', () => {
  const { filters, list, map } = setup();
  assert.equal(typeof filters.setCountyFilter, 'function', 'county filtering must be available');
  filters.setCountyFilter(['臺中市', '臺南市']);
  assert.deepEqual(list.places.map(p => p.id), [1, 2, 4]);
  assert.deepEqual(map.visible, [[24, 120], [23, 120], [24.1, 120]]);
});
test('county selection intersects category and search, and clearing preserves those filters', () => {
  const { filters, list, map } = setup();
  assert.equal(typeof filters.setCountyFilter, 'function', 'county filtering must be available');
  filters.setCountyFilter(['臺中市', '臺南市']);
  filters.setCategoryFilter(['CAFE']);
  assert.deepEqual(list.places.map(p => p.id), [1, 2]);
  filters.setSearchFilter('臺北');
  assert.deepEqual(list.places, []);
  assert.deepEqual(map.visible, []);
  filters.setCountyFilter([]);
  assert.deepEqual(list.places.map(p => p.id), [3]);
  assert.deepEqual(map.visible, [[25, 121]]);
});
test('sidebar toggles counties independently and clearing restores all places', () => {
  const { filters, list } = setup();
  const sidebar = new SidebarComponent(filters);
  assert.equal(typeof sidebar.toggleCounty, 'function', 'county checkboxes must toggle filters');
  sidebar.toggleCounty('臺中市');
  sidebar.toggleCounty('臺南市');
  assert.deepEqual(list.places.map(p => p.id), [1, 2, 4]);
  sidebar.toggleCounty('臺中市');
  assert.deepEqual(list.places.map(p => p.id), [2]);
  sidebar.clearCounties();
  assert.equal(list.places.length, 4);
  assert.equal(sidebar.selectedCounties.length, 0);
});


test('multiple categories include either category in both list and map', () => {
  const { filters, list, map } = setup();
  const sidebar = new SidebarComponent(filters);
  assert.equal(typeof sidebar.toggleCategory, 'function', 'category checkboxes must support multiple selections');
  sidebar.toggleCategory('CAFE');
  sidebar.toggleCategory('ATTRACTION');
  assert.deepEqual(list.places.map(p => p.id), [1, 2, 3, 4]);
  assert.deepEqual(map.visible, [[24, 120], [23, 120], [25, 121], [24.1, 120]]);
  sidebar.toggleCategory('CAFE');
  assert.deepEqual(list.places.map(p => p.id), [4]);
  assert.deepEqual(map.visible, [[24.1, 120]]);
  sidebar.toggleCategory('ATTRACTION');
  assert.deepEqual(list.places.map(p => p.id), [1, 2, 3, 4]);
});

test('clearing categories preserves counties and search, and clearing counties preserves categories', () => {
  const { filters, list, map } = setup();
  const sidebar = new SidebarComponent(filters);
  assert.equal(typeof sidebar.toggleCategory, 'function', 'category checkboxes must support multiple selections');
  sidebar.toggleCounty('臺中市');
  sidebar.toggleCounty('臺南市');
  sidebar.toggleCategory('CAFE');
  sidebar.toggleCategory('ATTRACTION');
  assert.deepEqual(list.places.map(p => p.id), [1, 2, 4]);
  assert.deepEqual(map.visible, [[24, 120], [23, 120], [24.1, 120]]);
  filters.setSearchFilter('景點');
  assert.deepEqual(list.places.map(p => p.id), [4]);
  sidebar.clearCategories();
  assert.equal(sidebar.selectedCategories.length, 0);
  assert.deepEqual(list.places.map(p => p.id), [4]);
  assert.deepEqual(map.visible, [[24.1, 120]]);
  filters.setSearchFilter('');
  sidebar.toggleCategory('CAFE');
  sidebar.clearCounties();
  assert.deepEqual(list.places.map(p => p.id), [1, 2, 3]);
  assert.deepEqual(map.visible, [[24, 120], [23, 120], [25, 121]]);
});


test('place markers expose details and directions in their popup', () => {
  const filters = new PlaceMarkerService({ getPlaces: () => of([]) });
  const place = { ...places[0], address: '臺中市中區測試路 1 號', description: '巷弄裡的咖啡店。', tags: ['手沖', '甜點'], websiteUrl: 'https://cafe.example.tw/menu' };
  const popup = filters.createMarker(place).getPopup();
  assert.ok(popup, 'clicking a place marker must open a details popup');
  const html = popup.getContent();
  assert.ok(html.includes('臺中咖啡'));
  assert.ok(html.includes('咖啡'));
  assert.ok(html.includes('臺中市中區測試路 1 號'));
  assert.ok(html.includes('巷弄裡的咖啡店。'));
  assert.ok(html.includes('手沖'));
  assert.ok(html.includes('https://cafe.example.tw/menu'));
  assert.ok(html.includes('https://www.google.com/maps/search/?api=1'));
});

test('details popup handles missing fields and escapes text and unsafe links', () => {
  const filters = new PlaceMarkerService({ getPlaces: () => of([]) });
  const place = { ...places[0], name: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', websiteUrl: 'javascript:alert(1)', tags: ['<b>tag</b>'] };
  const popup = filters.createMarker(place).getPopup();
  assert.ok(popup, 'place markers must include a popup even when optional fields are absent');
  const html = popup.getContent();
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('undefined'));
  assert.ok(html.includes('Google 地圖'));
});


const locationServiceFile = 'src/app/core/services/location.service.ts';
function getLocationService() {
  assert.ok(fs.existsSync(locationServiceFile), 'a location service must support phone and IP positioning');
  return load(locationServiceFile).LocationService;
}

test('desktop location uses IP coordinates and converts kilometer accuracy to meters', () => {
  const LocationService = getLocationService();
  const service = new LocationService({ get: url => {
    assert.equal(url, 'https://get.geojs.io/v1/ip/geo.json');
    return of({ latitude: '24.1477', longitude: '120.6736', accuracy: 5 });
  } }, { defaultView: { navigator: { userAgent: 'Mozilla Windows NT', maxTouchPoints: 0 } } });
  let location;
  service.watchLocation().subscribe(value => { location = value; });
  assert.deepEqual(location, { latitude: 24.1477, longitude: 120.6736, accuracy: 5000, source: 'ip' });
});

test('phone location watches fresh device positions and releases the watch on unsubscribe', () => {
  const LocationService = getLocationService();
  let cleared;
  let update;
  const service = new LocationService({ get: () => { throw new Error('device positioning must not request IP data'); } }, {
    defaultView: { navigator: { userAgent: 'Mozilla iPhone', maxTouchPoints: 5, geolocation: {
      watchPosition(success, error, options) {
        assert.equal(options.enableHighAccuracy, true);
        assert.equal(options.maximumAge, 10000);
        update = success;
        return 7;
      },
      clearWatch(id) { cleared = id; }
    } } }
  });
  const locations = [];
  const subscription = service.watchLocation().subscribe(value => locations.push(value));
  update({ coords: { latitude: 25.03, longitude: 121.56, accuracy: 15 } });
  update({ coords: { latitude: 25.04, longitude: 121.57, accuracy: 10 } });
  assert.deepEqual(locations, [
    { latitude: 25.03, longitude: 121.56, accuracy: 15, source: 'device' },
    { latitude: 25.04, longitude: 121.57, accuracy: 10, source: 'device' }
  ]);
  subscription.unsubscribe();
  assert.equal(cleared, 7);
});

test('phone permission denial falls back to an explicitly approximate IP position', () => {
  const LocationService = getLocationService();
  const service = new LocationService({ get: () => of({ latitude: '22.63', longitude: '120.30' }) }, {
    defaultView: { navigator: { userAgent: 'Android Mobile', geolocation: {
      watchPosition(success, error) { error({ code: 1 }); return 8; },
      clearWatch() {}
    } } }
  });
  let location;
  service.watchLocation().subscribe(value => { location = value; });
  assert.equal(location.source, 'ip');
  assert.equal(location.latitude, 22.63);
});

test('invalid IP responses never produce a fabricated zero-coordinate location', () => {
  const LocationService = getLocationService();
  for (const response of [{ latitude: 0, longitude: 0 }, { latitude: null, longitude: null }, { latitude: '', longitude: '' }, { latitude: '91', longitude: '181' }]) {
    const service = new LocationService({ get: () => of(response) }, { defaultView: { navigator: { userAgent: 'Windows' } } });
    let received = false;
    let failure;
    service.watchLocation().subscribe(() => { received = true; }, error => { failure = error; });
    assert.equal(received, false);
    assert.ok(failure, 'invalid coordinates must report an error');
  }
});

test('return-to-location centers the newest position while preserving the current zoom', () => {
  const { TaiwanMapComponent } = load('src/app/features/map/taiwan-map.component.ts');
  const calls = [];
  const component = new TaiwanMapComponent({}, { loadMarkers() {} }, {}, {});
  component.map = { getZoom: () => 13, setView: (coordinates, zoom) => calls.push({ coordinates, zoom }) };
  component.currentLocation = { latitude: 24.15, longitude: 120.67, source: 'device', accuracy: 10 };
  assert.equal(typeof component.returnToLocation, 'function', 'the map must offer a return-to-location action');
  component.returnToLocation();
  component.currentLocation = { latitude: 24.16, longitude: 120.68, source: 'device', accuracy: 12 };
  component.returnToLocation();
  assert.deepEqual(calls, [
    { coordinates: [24.15, 120.67], zoom: 13 },
    { coordinates: [24.16, 120.68], zoom: 13 }
  ]);
});


test('new device fixes update the position without pulling the map back after a manual pan', () => {
  const { Subject } = require('rxjs');
  const positions = new Subject();
  const { TaiwanMapComponent } = load('src/app/features/map/taiwan-map.component.ts');
  const calls = [];
  let currentZoom = 10;
  const component = new TaiwanMapComponent({}, { loadMarkers() {} }, {}, { watchLocation: () => positions });
  component.map = {
    visible: [],
    getZoom: () => currentZoom,
    setView(coordinates, zoom) { currentZoom = zoom; calls.push({ coordinates, zoom }); }
  };
  component.returnToLocation();
  positions.next({ latitude: 24.15, longitude: 120.67, source: 'device' });
  component.map.setView([25, 121], 8);
  positions.next({ latitude: 24.16, longitude: 120.68, source: 'device' });
  assert.equal(calls.length, 2, 'new position fixes must not override a manual map pan');
  component.returnToLocation();
  assert.deepEqual(calls[2], { coordinates: [24.16, 120.68], zoom: 8 });
  assert.equal(component.locationLoading, false);
});


test('unavailable location centers Taichung Station without presenting it as the user position', () => {
  const { throwError } = require('rxjs');
  const { TaiwanMapComponent } = load('src/app/features/map/taiwan-map.component.ts');
  const calls = [];
  const component = new TaiwanMapComponent({}, { loadMarkers() {} }, {}, {
    watchLocation: () => throwError(new Error('No valid location'))
  });
  component.map = { setView: (coordinates, zoom) => calls.push({ coordinates, zoom }) };
  component.returnToLocation();
  assert.deepEqual(calls, [{ coordinates: [24.13694, 120.68472], zoom: 15 }]);
  assert.equal(component.currentLocation, null);
  assert.equal(component.locationLoading, false);
  assert.ok(component.locationStatus.includes('台中火車站'));
});
