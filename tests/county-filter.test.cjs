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
    if (name === '@angular/core') return { Injectable: () => value => value, Component: () => value => value };
    if (name === 'leaflet') return {
      divIcon: options => options,
      point: (x, y) => ({ x, y }),
      marker: coordinates => ({
        bindPopup(content, options) { this.popup = { getContent: () => content, options }; return this; },
        getPopup() { return this.popup; },
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
