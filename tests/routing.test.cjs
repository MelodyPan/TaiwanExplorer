const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file){
 const module={exports:{}},source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2018,experimentalDecorators:true}}).outputText;
 const req=name=>name==='@angular/core'?{Injectable:()=>x=>x}:name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name);
 vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:file})(req,module,module.exports);return module.exports;
}
function routeUtils(){return load('src/app/core/utils/route.ts');}
const origin={latitude:24.13694,longitude:120.68472,source:'device'};
const destination={latitude:24.1375,longitude:120.684};
test('three travel modes use distinct vehicle access rules, not car speed multipliers',()=>{
 const {buildRouteRequest}=routeUtils();
 for(const [mode,costing] of [['driving','auto'],['scooter','motor_scooter'],['walking','pedestrian']]){
  const request=buildRouteRequest(origin,destination,mode);
  assert.equal(request.costing,costing);assert.equal(request.format,'osrm');assert.equal(request.shape_format,'geojson');
  assert.deepEqual(request.locations,[{lat:24.13694,lon:120.68472},{lat:24.1375,lon:120.684}]);
 }
});
test('invalid coordinates and unknown modes cannot be sent as a route request',()=>{
 const {buildRouteRequest}=routeUtils();
 for(const point of [null,{latitude:0,longitude:0},{latitude:91,longitude:120},{latitude:24,longitude:NaN},{latitude:'24',longitude:120}]){
  assert.throws(()=>buildRouteRequest(point,destination,'driving'));
  assert.throws(()=>buildRouteRequest(origin,point,'driving'));
 }
 assert.throws(()=>buildRouteRequest(origin,destination,'bicycle'));
});
test('route result uses real route meters/seconds and converts GeoJSON into Leaflet coordinates',()=>{
 const {parseRouteResult}=routeUtils();
 assert.deepEqual(parseRouteResult({code:'Ok',routes:[{distance:1234,duration:300,geometry:{type:'LineString',coordinates:[[120.68,24.13],[120.69,24.14]]}}]}),{
  distanceMeters:1234,durationSeconds:300,coordinates:[[24.13,120.68],[24.14,120.69]]
 });
});
test('malformed or unavailable routes are rejected instead of displaying invented estimates',()=>{
 const {parseRouteResult}=routeUtils();
 for(const data of [{},{code:'NoRoute',routes:[]},{code:'Ok',routes:[{distance:-1,duration:20}]},{code:'Ok',routes:[{distance:1,duration:NaN,geometry:{type:'LineString',coordinates:[[120,24],[120,25]]}}]},{code:'Ok',routes:[{distance:1,duration:1,geometry:{type:'LineString',coordinates:[[120,24],[220,25]]}}]}])assert.throws(()=>parseRouteResult(data));
});
module.exports={load};

const response={code:'Ok',routes:[{distance:1000,duration:120,geometry:{type:'LineString',coordinates:[[120,24],[121,25]]}}]};
test('routing service delays rapid requests, reuses short-lived cache, and cancellation prevents queued network calls',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:10000});
 const {of}=require('rxjs'),{RoutingService}=load('src/app/core/services/routing.service.ts'),calls=[];
 const service=new RoutingService({get:(url,options)=>{calls.push({url,options,time:Date.now()});return of(response);}});
 let result;service.route(origin,destination,'driving').subscribe(value=>result=value);
 t.mock.timers.tick(1);assert.equal(calls.length,1);assert.equal(result.distanceMeters,1000);
 assert.equal(calls[0].options.headers['X-Client-Id'],'melodypan.github.io/TaiwanExplorer');
 service.route(origin,destination,'driving').subscribe();assert.equal(calls.length,1);
 const pending=service.route(origin,destination,'scooter').subscribe();t.mock.timers.tick(500);assert.equal(calls.length,1);
 pending.unsubscribe();t.mock.timers.tick(2000);assert.equal(calls.length,1);
 service.route(origin,destination,'walking').subscribe();t.mock.timers.tick(1);assert.equal(calls.length,2);
 assert.equal(JSON.parse(calls[1].options.params.json).costing,'pedestrian');
 t.mock.timers.tick(300001);service.route(origin,destination,'driving').subscribe();t.mock.timers.tick(1);assert.equal(calls.length,3);
});
test('unsubscribing an active route aborts its subscription and a timeout returns an error',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:10000});
 const {Subject}=require('rxjs'),{RoutingService}=load('src/app/core/services/routing.service.ts'),pending=[];
 const service=new RoutingService({get:()=>{const subject=new Subject();pending.push(subject);return subject;}});
 const sub=service.route(origin,destination,'driving').subscribe();t.mock.timers.tick(1);assert.equal(pending[0].observers.length,1);
 sub.unsubscribe();assert.equal(pending[0].observers.length,0);
 let error;service.route(origin,destination,'walking').subscribe({error:value=>error=value});t.mock.timers.tick(1100);t.mock.timers.tick(20001);
 assert.equal(error.name,'TimeoutError');assert.equal(pending[1].observers.length,0);
});
test('displayed route duration and distance use readable minutes, hours and metric units',()=>{
 const {formatRouteDistance,formatRouteDuration}=routeUtils();
 assert.equal(formatRouteDistance(123),'123 公尺');assert.equal(formatRouteDistance(1234),'1.2 公里');
 assert.equal(formatRouteDuration(30),'1 分鐘');assert.equal(formatRouteDuration(3600),'1 小時');assert.equal(formatRouteDuration(3660),'1 小時 1 分鐘');
});
