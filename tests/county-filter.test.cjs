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
      marker: coordinates => ({
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
  filters.setCategoryFilter('CAFE');
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
