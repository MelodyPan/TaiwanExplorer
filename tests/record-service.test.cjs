const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {BehaviorSubject}=require('rxjs');
function fixture(){
 const events={},storage=new Map(),initial={schemaVersion:1,records:{},updatedAt:'2026-10-29T00:00:00Z'};let content=initial,revision=1,account='a',writes=0;const timers=[];
 const store={reset(){},async account(){return {id:account};},async listLibraries(){return [{id:'records'}];},async read(){return {datasetId:'records',document:structuredClone(content),revision:[String(revision)]};},async write(id,document,expected){writes++;assert.deepEqual(expected,[String(revision)]);content=structuredClone(document);return {datasetId:id,document:content,revision:[String(++revision)]};}};
 const window={addEventListener(name,fn){events[name]=fn;},RecordLogin:require('../src/assets/records/record-login.js'),RecordFile:require('../src/assets/records/record-file.js'),RecordCloud:require('../src/assets/records/record-cloud.js'),RecordDrive:{createDriveStore:()=>store},RecordConfig:{googleClientId:'test'},RecordAuth:{requestToken:async()=>({access_token:'test-token',expires_in:3600})}};
 const module={exports:{}};
 const source=ts.transpileModule(fs.readFileSync('src/app/core/services/place-records.service.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(source,{module,exports:module.exports,require:name=>name==='@angular/core'?{Injectable:()=>x=>x}:require(name),window,document:{addEventListener(){}},navigator:{onLine:true},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setInterval:fn=>timers.push(fn),setTimeout,Date,alert(){}});
 const service=new module.exports.PlaceRecordsService({run:fn=>fn(),runOutsideAngular:fn=>fn()});
 return {service,events,timers,get writes(){return writes;},setAccount(id){account=id;},update(record){content={...content,records:{'1':record}};revision++;}};
}
const record=()=>({category:null,rating:4,visited:true,parking:false,seasonal:true,seasonalNote:'三月賞櫻'});
test('connect and reload restore all personal fields across devices',async()=>{const f=fixture();await f.service.session.connect();assert.equal(f.service.canEdit,true);assert.equal(await f.service.save(1,record()),true);assert.equal(f.writes,1);await f.service.session.refresh();assert.deepEqual(JSON.parse(JSON.stringify(f.service.record(1))),record());});
test('expired authorization masks records and blocks save, then same account can reconnect',async()=>{const f=fixture();await f.service.session.connect();await f.service.save(1,record());f.service.expires=0;f.timers[0]();assert.equal(f.service.visible,false);assert.equal(f.service.canEdit,false);assert.equal(f.service.record(1).rating,null);assert.equal(await f.service.save(1,record()),false);await f.service.session.connect();assert.equal(f.service.record(1).rating,4);});
test('editing an old record cannot overwrite a background refresh from another device',async()=>{const f=fixture();await f.service.session.connect();const original=f.service.record(1);f.update({...record(),rating:5});await f.service.session.refresh();await assert.rejects(f.service.save(1,record(),original),/另一台|更新/);assert.equal(f.writes,0);});
test('seasonal explanation is removed when no longer seasonal',async()=>{const f=fixture();await f.service.session.connect();await f.service.save(1,{...record(),seasonal:false});assert.equal(f.service.record(1).seasonalNote,'');});

test('reconnecting with unsaved editor forms rejects a different account',async()=>{const f=fixture();await f.service.session.connect();f.service.editorAccountId='a';f.setAccount('b');await f.service.session.connect();assert.equal(f.service.state.error.code,'account');assert.equal(f.service.visible,false);assert.equal(f.writes,0);});

test('category saves and reloads with other personal fields and can reset to the public category',async()=>{
 const f=fixture();await f.service.session.connect();
 await f.service.save(1,{...record(),category:'CAFE'});await f.service.session.refresh();
 assert.equal(f.service.record(1).category,'CAFE');assert.equal(f.service.record(1).rating,4);
 await f.service.save(1,{...f.service.record(1),category:null});assert.equal(f.service.record(1).category,null);assert.equal(f.service.record(1).rating,4);
});
