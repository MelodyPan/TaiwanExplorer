const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCloudSession}=require('../src/assets/records/record-cloud.js');
function fixture(saveDelayMs=0){
 let identity='a',fail=null,revision=1,content={value:1},reads=0,writes=0;
 const store={reset(){},async account(){return{id:identity,email:identity+'@example.test'};},async listLibraries(){return[{id:'library'}];},async read(){reads++;return {datasetId:'library',document:structuredClone(content),revision:[String(revision)]};},async write(id,document,expected){writes++;if(fail)throw fail;assert.deepEqual(expected,[String(revision)]);content=document;return {datasetId:id,document,revision:[String(++revision)]};},async create(document){return {datasetId:'new',document,revision:['1']};},async readHead(){return {document:{value:9},revision:['2','3']};},async resolve(id,document,expected){assert.deepEqual(expected,['2','3']);return {datasetId:id,document,revision:['4']};}};
 const session=createCloudSession({store,saveDelayMs,authorize:async()=>{},onChange(){}});
 return {session,store,setAccount(value){identity=value;},fail(value){fail=value;},stats:()=>({reads,writes})};
}
test('burst edits coalesce to one latest write and identical data skips upload',async()=>{
 const f=fixture(20),s=f.session;await s.connect();const a=s.save({value:2}),b=s.save({value:3}),c=s.save({value:4});assert(s.hasUnsaved);await Promise.all([a,b,c]);assert.equal(f.stats().writes,1);assert.equal(s.state.document.value,4);assert.equal(s.state.pending,0);assert.equal(s.state.phase,'ready');
 await s.save({value:4,updatedAt:'2026-10-26T12:00:00Z'});assert.equal(f.stats().writes,1);assert.equal(s.hasUnsaved,false);
});
test('edits arriving during an upload coalesce into the next write and preserve ordering',async()=>{
 const f=fixture(10),s=f.session;await s.connect();let started,release;const begun=new Promise(r=>started=r),gate=new Promise(r=>release=r),write=f.store.write;let calls=0;
 f.store.write=async(...args)=>{if(++calls===1){started();await gate;}return write(...args);};
 const first=s.save({value:2});await begun;const second=s.save({value:3}),third=s.save({value:4});release();await Promise.all([first,second,third]);assert.equal(f.stats().writes,2);assert.equal(s.state.document.value,4);assert.equal(s.hasUnsaved,false);
});
test('failed batched upload keeps the newest draft and retries it without losing edits',async()=>{
 const f=fixture(10),s=f.session;await s.connect();f.fail(Object.assign(new Error('offline'),{code:'network'}));await Promise.all([s.save({value:2}),s.save({value:3})]);assert.equal(f.stats().writes,1);assert.equal(s.state.draft.value,3);assert.equal(s.state.phase,'error');f.fail(null);await s.retry();assert.equal(s.state.document.value,3);assert.equal(s.hasUnsaved,false);
});
test('connect loads the sole cloud library; saves and clean refreshes update memory only',async()=>{
 const {session:s,stats}=fixture();assert.equal(s.state.phase,'disconnected');await s.connect();assert.equal(s.state.document.value,1);
 await s.save({value:2});assert.equal(s.state.phase,'ready');assert.equal(s.state.draft,null);await s.refresh();assert.equal(s.state.document.value,2);assert.equal(stats().reads,2);
 await s.disconnect();assert.equal(s.state.document,null);assert.equal(s.state.account,null);
});
test('failed writes keep drafts, refresh cannot discard them and retry uses the failed revision',async()=>{
 const f=fixture(),s=f.session;await s.connect();f.fail(Object.assign(new Error('offline'),{code:'network'}));
 await s.save({value:2});assert.equal(s.state.phase,'error');assert.equal(s.state.draft.value,2);await s.refresh();assert.equal(f.stats().reads,1);
 await assert.rejects(s.disconnect(),/草稿/);f.fail(null);await s.retry();assert.equal(s.state.phase,'ready');assert.equal(s.state.document.value,2);
});
test('wrong-account reauthorization hides the library and cannot retry the old account draft',async()=>{
 const f=fixture(),s=f.session;await s.connect();f.fail(Object.assign(new Error('expired'),{code:'auth'}));await s.save({value:2});
 f.setAccount('b');await s.connect();assert.equal(s.state.error.code,'account');assert.equal(s.state.document,null);assert.equal(s.state.draft.value,2);
 await s.retry();assert.equal(f.stats().writes,1);assert.equal(s.state.error.code,'account');
 f.setAccount('a');f.fail(null);await s.connect();assert.equal(s.state.document.value,2);assert.equal(s.state.draft,null);
});
test('conflict choices only resolve explicitly; saves stay blocked until resolved',async()=>{
 const f=fixture(),s=f.session;await s.connect();f.fail(Object.assign(new Error('conflict'),{code:'conflict',heads:[{id:'2'},{id:'3'}],revision:['2','3']}));await s.save({value:2});
 assert.equal(s.state.phase,'conflict');await s.save({value:99});assert.equal(s.state.draft.value,2);
 f.fail(null);await s.resolve('2');assert.equal(s.state.document.value,9);assert.equal(s.state.draft,null);assert.deepEqual(s.state.revision,['4']);
});
test('empty and multiple datasets require explicit selection/creation; offline saves are blocked',async()=>{
 const f=fixture(),s=f.session;f.store.listLibraries=async()=>[];await s.connect();assert.equal(s.state.phase,'empty');await s.create({value:0});assert.equal(s.state.datasetId,'new');
 s.setOnline(false);await s.save({value:3});assert.equal(f.stats().writes,0);assert.equal(s.state.document.value,0);s.setOnline(true);
 await s.disconnect();f.store.listLibraries=async()=>[{id:'one'},{id:'two'}];await s.connect();assert.equal(s.state.phase,'choosing');assert.equal(s.state.document,null);
});
test('multiple rapid edits are serialized and reauthorization cannot race a write',async()=>{
 const f=fixture(),s=f.session;await s.connect();let release;const gate=new Promise(r=>release=r),original=f.store.write;f.store.write=async(...args)=>{await gate;return original(...args);};
 const a=s.save({value:2}),b=s.save({value:3});assert.equal(s.state.pending,2);await s.connect();assert.equal(s.state.error.code,'busy');release();await Promise.all([a,b]);assert.equal(s.state.document.value,3);assert.equal(f.stats().writes,2);
});
test('a failed explicit conflict resolution retries the chosen version against all conflict parents',async()=>{
 const f=fixture(),s=f.session;await s.connect();f.fail(Object.assign(new Error('conflict'),{code:'conflict',heads:[{id:'2'},{id:'3'}],revision:['2','3']}));await s.save({value:2});
 const resolve=f.store.resolve;let attempts=0;f.store.resolve=async(...args)=>{if(++attempts===1)throw Object.assign(new Error('lost reply'),{code:'network'});return resolve(...args);};
 await s.resolve('2');assert.equal(s.state.phase,'error');assert.equal(s.state.draft.value,9);await s.retry();assert.equal(s.state.document.value,9);assert.deepEqual(s.state.revision,['4']);assert.equal(attempts,2);
});
test('reconnecting a conflict refreshes cloud choices without discarding the local memory draft',async()=>{
 const f=fixture(),s=f.session;await s.connect();f.fail(Object.assign(new Error('conflict'),{code:'conflict',heads:[{id:'2'},{id:'3'}],revision:['2','3']}));await s.save({value:2});
 f.store.read=async()=>({datasetId:'library',document:{value:9},revision:['4'],heads:[{id:'4'}]});await s.connect();
 assert.equal(s.state.phase,'conflict');assert.equal(s.state.draft.value,2);assert.deepEqual(s.state.heads,[{id:'4'}]);
});
test('authorization with an unverified identity cannot retry any previous-account write',async()=>{
 const f=fixture(),s=f.session;await s.connect();f.fail(Object.assign(new Error('uncertain upload'),{code:'network'}));await s.save({value:2});
 f.setAccount('b');f.store.account=async()=>{throw Object.assign(new Error('identity request failed'),{code:'network'});};await s.connect();
 const before=f.stats().writes;await s.retry();assert.equal(f.stats().writes,before);assert.equal(s.state.error.code,'account');assert.equal(s.state.document,null);
});
test('reimport replaces the current dataset as a new version and retains drafts on failure',async()=>{
 const f=fixture(),s=f.session;await s.connect();await s.replace({value:546});assert.equal(s.state.datasetId,'library');assert.equal(s.state.document.value,546);assert.equal(f.stats().writes,1);
 f.fail(Object.assign(new Error('offline'),{code:'network'}));await s.replace({value:547});assert.equal(s.state.draft.value,547);assert.equal(s.state.phase,'error');f.fail(null);await s.retry();assert.equal(s.state.document.value,547);
});


test('background refresh retains visible data and identical results retain document identity',async()=>{
 const f=fixture(),s=f.session;await s.connect();const previous=s.state.document,read=f.store.read;let release;
 const gate=new Promise(resolve=>release=resolve);f.store.read=async(...args)=>{await gate;return read(...args);};
 const refreshing=s.refresh();assert.equal(s.state.document,previous,'visible bookmarks must not disappear while reading Drive');assert.equal(s.state.phase,'loading');
 release();await refreshing;assert.equal(s.state.document,previous,'unchanged content must not rebuild the UI');assert.equal(s.state.phase,'ready');
 f.store.read=async()=>{throw Object.assign(new Error('offline'),{code:'network'});};await s.refresh();assert.equal(s.state.document,previous);assert.equal(s.state.phase,'error');
});
