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
    if (name === '@angular/core') return { Injectable: () => value => value, Component: () => value => value, Inject: () => () => {}, HostListener: () => () => {} };
    if (name === '@angular/common') return { DOCUMENT: 'DOCUMENT', CommonModule: class {} };
    if (name.startsWith('src/')) return load(name + '.ts');
    if (name === 'leaflet') return {
      divIcon: options => options,
      point: (x, y) => ({ x, y }),
      polyline: coordinates => ({
        addTo(map) {this.map=map;map.routeCoordinates=coordinates;return this;},
        getBounds(){return coordinates;},
        remove(){this.map.routeCoordinates=null;}
      }),
      marker: coordinates => ({
        on() {return this;},
        openPopup() {this.opened=true;return this;},
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

function swipeList(visible = true) {
  const opened = [];
  const records = { visible, changes$: new (require('rxjs').BehaviorSubject)(0), open: place => opened.push(place.id) };
  const list = new PlaceListComponent({ getPlaces: () => of(places) }, new PlaceMarkerService({ getPlaces: () => of(places) }), records);
  list.ngOnInit();
  return { list, records, opened };
}
const pointer = (x, y, pointerId = 1) => ({ clientX: x, clientY: y, pointerId, button: 0, isPrimary: true });
test('left swipe reveals one edit action without opening the editor; editing closes the action', () => {
  const {list, opened} = swipeList();
  assert.equal(list.revealedPlaceId, null);
  list.onRowPointerDown(places[0], pointer(240, 100));
  list.onRowPointerUp(places[0], pointer(130, 110));
  assert.equal(list.revealedPlaceId, 1);
  assert.deepEqual(opened, []);
  list.onRowPointerDown(places[1], pointer(240, 100));
  list.onRowPointerUp(places[1], pointer(130, 100));
  assert.equal(list.revealedPlaceId, 2);
  list.editPlace(places[1]);
  assert.deepEqual(opened, [2]);
  assert.equal(list.revealedPlaceId, null);
});
test('vertical scrolling, small movement, cancellation and logged-out swipes do not reveal edit', () => {
  const {list, records, opened} = swipeList();
  for (const [x,y] of [[225,100],[220,220],[140,200]]) {
    list.onRowPointerDown(places[0], pointer(240,100));
    list.onRowPointerUp(places[0], pointer(x,y));
    assert.equal(list.revealedPlaceId,null);
  }
  list.onRowPointerDown(places[0], pointer(240,100));list.cancelRowGesture();list.onRowPointerUp(places[0],pointer(100,100));assert.equal(list.revealedPlaceId,null);
  records.visible=false;list.onRowPointerDown(places[0],pointer(240,100));list.onRowPointerUp(places[0],pointer(100,100));list.editPlace(places[0]);assert.equal(list.revealedPlaceId,null);assert.deepEqual(opened,[]);
});
test('right swipe, keyboard dismissal, filters and logout close the revealed action', () => {
  const {list,records}=swipeList();const key=key=>({key,preventDefault(){}});
  list.onRowKeydown(places[0],key('ArrowLeft'));assert.equal(list.revealedPlaceId,1);
  list.onRowPointerDown(places[0],pointer(100,100));list.onRowPointerUp(places[0],pointer(210,100));assert.equal(list.revealedPlaceId,null);
  list.onRowKeydown(places[0],key('ArrowLeft'));list.onRowKeydown(places[0],key('Escape'));assert.equal(list.revealedPlaceId,null);
  list.onRowKeydown(places[0],key('ArrowLeft'));list.placeMarkerService.setSearchFilter('臺北');assert.equal(list.revealedPlaceId,null);
  list.onRowKeydown(places[0],key('ArrowLeft'));records.visible=false;records.changes$.next(1);assert.equal(list.revealedPlaceId,null);
  list.ngOnDestroy();
});

test('assistive activation reveals Edit without opening a dialog and editing retains a focus target', () => {
  const {list, records, opened}=swipeList();let focused=false;
  list.revealEdit(places[0]);assert.equal(list.revealedPlaceId,1);assert.deepEqual(opened,[]);
  list.editPlace(places[0],{focus(){focused=true;}});assert.equal(focused,true);assert.deepEqual(opened,[1]);
  records.visible=false;list.revealEdit(places[1]);assert.equal(list.revealedPlaceId,null);
});

const { AppComponent } = load('src/app/app.component.ts');
test('back-to-top appears after page scrolling and respects reduced-motion preference', () => {
  const original=global.window,calls=[];
  try {
    global.window={scrollY:0,scrollTo:options=>calls.push(options),matchMedia:()=>({matches:false})};
    const app=new AppComponent();assert.equal(app.showBackToTop,false);
    window.scrollY=450;app.updateScrollPosition();assert.equal(app.showBackToTop,true);
    app.scrollToTop();assert.deepEqual(calls.pop(),{top:0,behavior:'smooth'});
    window.matchMedia=()=>({matches:true});app.scrollToTop();assert.deepEqual(calls.pop(),{top:0,behavior:'auto'});
    window.scrollY=0;app.updateScrollPosition();assert.equal(app.showBackToTop,false);
  } finally {global.window=original;}
});

const { PlaceService } = load('src/app/core/services/place.service.ts');
test('personal categories update list and map filters together, restore original on logout, and reuse public data', () => {
  const {BehaviorSubject}=require('rxjs');let category=null,visible=true,requests=0;
  const changes$=new BehaviorSubject(0);
  const records={changes$,record:id=>({category:visible&&id===1?category:null})};
  const data=new PlaceService({get:()=>{requests++;return of(places);}},records);
  const filters=new PlaceMarkerService(data),list=new PlaceListComponent(data,filters);list.ngOnInit();
  const map={visible:[],getZoom:()=>10,getBounds:()=>({contains:()=>true})};filters.setCategoryFilter(['CAFE']);filters.loadMarkers(map);
  assert.deepEqual(list.places.map(x=>x.id),[1,2,3]);
  category='FOOD';changes$.next(1);
  assert.deepEqual(list.places.map(x=>x.id),[2,3]);assert.deepEqual(map.visible,[[23,120],[25,121]]);
  filters.setCategoryFilter(['FOOD']);assert.deepEqual(list.places.map(x=>x.id),[1]);assert.deepEqual(map.visible,[[24,120]]);
  filters.loadMarkers(map);filters.loadMarkers(map);assert.equal(requests,1);assert.equal(changes$.observers.length,1);
  visible=false;changes$.next(2);assert.deepEqual(list.places,[]);assert.deepEqual(map.visible,[]);
  visible=true;category=null;changes$.next(3);filters.setCategoryFilter(['CAFE']);assert.deepEqual(list.places.map(x=>x.id),[1,2,3]);
  filters.clearMarkers();list.ngOnDestroy();
});

const { sortPlacesByDistance } = load('src/app/core/utils/place-distance.ts');
test('distance sorting is nearest first, stable for ties, and never mutates public place order', () => {
  const origin={latitude:24,longitude:120,source:'device'};
  assert.deepEqual(sortPlacesByDistance(places,origin).map(p=>p.id),[1,4,2,3]);
  assert.deepEqual(places.map(p=>p.id),[1,2,3,4]);
  const tied=[{...places[0],id:9},{...places[0],id:8}];assert.deepEqual(sortPlacesByDistance(tied,origin).map(p=>p.id),[9,8]);
  const invalid={...places[0],id:7,latitude:NaN};assert.equal(sortPlacesByDistance([invalid,...places],origin).at(-1).id,7);
  assert.deepEqual(sortPlacesByDistance(places,null).map(p=>p.id),[1,2,3,4]);
  assert.deepEqual(sortPlacesByDistance(places,{...origin,latitude:0,longitude:0}).map(p=>p.id),[1,2,3,4]);
});
test('list applies nearest-first after filtering and reacts to GPS/IP updates or lost location', () => {
  const {BehaviorSubject}=require('rxjs'),currentLocation$=new BehaviorSubject(null);
  const data={getPlaces:()=>of(places)},filters=new PlaceMarkerService(data);
  const list=new PlaceListComponent(data,filters,undefined,{currentLocation$});list.ngOnInit();
  assert.deepEqual(list.places.map(p=>p.id),[1,2,3,4]);
  currentLocation$.next({latitude:24,longitude:120,source:'device'});assert.deepEqual(list.places.map(p=>p.id),[1,4,2,3]);
  filters.setCategoryFilter(['CAFE']);assert.deepEqual(list.places.map(p=>p.id),[1,2,3]);
  currentLocation$.next({latitude:25,longitude:121,source:'ip'});assert.equal(list.places[0].id,3);
  filters.setCountyFilter(['臺中市','臺南市']);assert.deepEqual(list.places.map(p=>p.id),[1,2]);
  filters.setCountyFilter([]);currentLocation$.next(null);assert.deepEqual(list.places.map(p=>p.id),[1,2,3]);
  list.ngOnDestroy();assert.equal(currentLocation$.observers.length,0);
});

test('shared positioning state reuses the map request, retains completed IP fix and clears invalid results', () => {
  const LocationService=getLocationService();let requests=0,response={latitude:24,longitude:120};
  const service=new LocationService({get:()=>{requests++;return of(response);}},{defaultView:{navigator:{userAgent:'Windows'}}});
  const seen=[],a=service.currentLocation$.subscribe(value=>seen.push(value));
  const b=service.currentLocation$.subscribe(()=>{});assert.equal(requests,0);assert.equal(seen.at(-1),null);
  service.watchLocation().subscribe();assert.equal(requests,1);assert.equal(seen.at(-1).latitude,24);
  response={latitude:0,longitude:0};service.watchLocation().subscribe({error(){}});assert.equal(seen.at(-1),null);assert.equal(requests,2);
  a.unsubscribe();b.unsubscribe();
});

test('repeated or nearby positioning fixes do not interrupt an unchanged row swipe or edit action',()=>{
 const {BehaviorSubject}=require('rxjs'),currentLocation$=new BehaviorSubject({latitude:24,longitude:120,source:'device'});
 const records={visible:true,changes$:new BehaviorSubject(0),open(){}};
 const data={getPlaces:()=>of(places)},filters=new PlaceMarkerService(data);
 const list=new PlaceListComponent(data,filters,records,{currentLocation$});list.ngOnInit();
 list.revealEdit(places[0]);currentLocation$.next({latitude:24.0001,longitude:120,source:'device'});assert.equal(list.revealedPlaceId,1);
 list.onRowKeydown(places[0],{key:'Escape',preventDefault(){}});list.onRowPointerDown(places[0],pointer(240,100));
 currentLocation$.next({latitude:24.0001,longitude:120,source:'device'});list.onRowPointerUp(places[0],pointer(120,100));assert.equal(list.revealedPlaceId,1);
 filters.setSearchFilter('臺北');assert.equal(list.revealedPlaceId,null);list.ngOnDestroy();
});

test('tapping a place selects it while swipe-generated clicks and revealed actions do not navigate',()=>{
 const {list}=swipeList();const selected=[];list.placeMarkerService.selectPlace=place=>selected.push(place.id);
 list.selectPlace(places[0],{detail:1});assert.deepEqual(selected,[1]);
 list.onRowPointerDown(places[0],pointer(240,100));list.onRowPointerUp(places[0],pointer(120,100));
 list.selectPlace(places[0],{detail:1});assert.deepEqual(selected,[1]);assert.equal(list.revealedPlaceId,1);
 list.selectPlace(places[0],{detail:0});assert.equal(list.revealedPlaceId,null);assert.deepEqual(selected,[1]);
 list.selectPlace(places[0],{detail:0});assert.deepEqual(selected,[1,1]);
 list.records.visible=false;list.onRowPointerDown(places[0],pointer(240,100));list.onRowPointerUp(places[0],pointer(200,180));
 list.selectPlace(places[0],{detail:1});assert.deepEqual(selected,[1,1]);
});
test('selecting a place centers its marker and opens its popup after markers reload',()=>{
 const {filters,map}=setup();let center;map.setView=(coords,zoom)=>{center={coords,zoom};return map;};
 const created=[],original=filters.createMarker.bind(filters);
 filters.createMarker=place=>{const marker=original(place);marker.openPopup=()=>{created.push(place.id);return marker;};return marker;};
 filters.focusPlace(places[2]);assert.deepEqual(center,{coords:[25,121],zoom:15});assert.deepEqual(created,[3]);
});
test('route events stay inside the website and popup provides a planning action',()=>{
 const filters=new PlaceMarkerService({getPlaces:()=>of([])}),selected=[],routes=[];
 filters.placeSelected$.subscribe(place=>selected.push(place.id));filters.routeRequested$.subscribe(place=>routes.push(place.id));
 filters.selectPlace(places[0]);filters.requestRoute(places[1]);
 assert.deepEqual(selected,[1]);assert.deepEqual(routes,[2]);
 const html=filters.createMarker(places[0]).getPopup().getContent();
 assert.match(html,/class="place-info__route"/);assert.ok(html.includes('規劃路線'));
});
test('onsite routing clears old lines, cancels stale mode requests and never routes from the fallback station',()=>{
 const {Subject}=require('rxjs'),{TaiwanMapComponent}=load('src/app/features/map/taiwan-map.component.ts');
 const requests=[],routing={route(origin,destination,mode){const subject=new Subject();requests.push({origin,destination,mode,subject});return subject;}};
 const component=new TaiwanMapComponent({}, {loadMarkers(){},focusPlace(){}}, {}, {},routing);
 component.map={visible:[],fitBounds(){},closePopup(){},getContainer(){return {scrollIntoView(){},focus(){}};}};
 component.selectedPlace=places[0];component.planRoute();assert.equal(requests.length,0);assert.ok(component.routeError.includes('定位'));
 component.currentLocation={latitude:24,longitude:120,source:'ip'};component.planRoute();assert.equal(requests.length,1);assert.equal(component.routeLoading,true);
 component.changeRouteMode('scooter');assert.equal(requests[0].subject.observers.length,0);assert.equal(requests[1].mode,'scooter');
 requests[0].subject.next({coordinates:[[24,120],[25,121]],distanceMeters:999,durationSeconds:999});assert.equal(component.routeResult,null);
 requests[1].subject.next({coordinates:[[24,120],[25,121]],distanceMeters:1000,durationSeconds:120});assert.equal(component.routeResult.distanceMeters,1000);assert.equal(component.routeLoading,false);
 component.changeRouteMode('walking');assert.equal(component.routeResult,null);assert.equal(requests[2].mode,'walking');
 requests[2].subject.error(new Error('unavailable'));assert.equal(component.routeResult,null);assert.equal(component.routeLoading,false);assert.ok(component.routeError);
 component.clearRoute();assert.equal(component.routeResult,null);assert.equal(component.routeError,'');assert.equal(component.routeRequested,false);
});
