const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {BehaviorSubject}=require('rxjs');
function fixture(){
 const events={},storage=new Map(),initial={schemaVersion:1,records:{},updatedAt:'2026-10-29T00:00:00Z'};let content=initial,revision=1,account='a',writes=0;const timers=[];
 const store={reset(){},async account(){return {id:account};},async listLibraries(){return [{id:'records'}];},async read(){return {datasetId:'records',document:structuredClone(content),revision:[String(revision)]};},async write(id,document,expected){writes++;assert.deepEqual(expected,[String(revision)]);content=structuredClone(document);return {datasetId:id,document:content,revision:[String(++revision)]};}};
 const window={addEventListener(name,fn){events[name]=fn;},RecordLogin:require('../../src/assets/records/record-login.js'),RecordFile:require('../../src/assets/records/record-file.js'),RecordCloud:require('../../src/assets/records/record-cloud.js'),RecordDrive:{createDriveStore:()=>store},RecordConfig:{googleClientId:'test'},RecordAuth:{requestToken:async()=>({access_token:'test-token',expires_in:3600})}};
 const module={exports:{}};
 const source=ts.transpileModule(fs.readFileSync('src/app/core/services/place-records.service.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(source,{module,exports:module.exports,require:name=>name==='@angular/core'?{Injectable:()=>x=>x}:require(name),window,document:{addEventListener(){}},navigator:{onLine:true},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setInterval:fn=>timers.push(fn),setTimeout,Date,alert(){}});
 const service=new module.exports.PlaceRecordsService({run:fn=>fn(),runOutsideAngular:fn=>fn()});
 return {exports:module.exports,service,events,timers,get writes(){return writes;},setAccount(id){account=id;},update(record){content={...content,records:{'1':record}};revision++;}};
}

module.exports={fixture};
