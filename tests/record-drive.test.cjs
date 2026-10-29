const {test}=require('node:test'),assert=require('node:assert/strict');
const {createDriveStore}=require('../src/assets/records/record-drive.js');
const {createDataFile}=require('../src/assets/records/record-file.js');
const {createCloudSession}=require('../src/assets/records/record-cloud.js');
const document=()=>createDataFile({},'2026-10-26T07:00:00Z');
function fakeDrive({browserMetadata=false}={}){
 const files=new Map();let counter=0,failAfterUpload=false,barrier=null;
 const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers});
 async function request(address,options={}){
  assert.equal(options.headers.Authorization,'Bearer test-token');const url=new URL(address);
  if(url.pathname.startsWith('/drive/v2/files/')||url.pathname.startsWith('/upload/drive/v2/files/')){
   const forwarded=new URL(url);forwarded.pathname=forwarded.pathname.replace('/v2/','/v3/');let body=options.body;
   const convert=meta=>{assert(!meta.appProperties,'v2 writes must use private properties');assert((meta.properties||[]).every(p=>p.visibility==='PRIVATE'));const {title,properties,...rest}=meta;return {...rest,...(title?{name:title}:{}),appProperties:Object.fromEntries((properties||[]).map(p=>[p.key,p.value]))};};
   if(body){if(url.pathname.startsWith('/upload/')){const lines=body.split('\r\n'),index=lines.findIndex(line=>line.startsWith('{'));lines[index]=JSON.stringify(convert(JSON.parse(lines[index])));body=lines.join('\r\n');}else body=JSON.stringify(convert(JSON.parse(body)));}
   const response=await request(forwarded.href,{...options,...(body?{body}:{}),...(options.method==='PUT'?{method:'PATCH'}:{})});
   if(!response.ok||options.method)return response;
   const meta=await response.json(),stored=files.get(meta.id);return reply({id:meta.id,etag:String(stored.version||1),parents:(meta.parents||[]).map(id=>({id})),properties:Object.entries(meta.appProperties||{}).map(([key,value])=>({key,value,visibility:'PRIVATE'}))});
  }
  if(url.pathname.endsWith('/about'))return reply({user:{permissionId:'account-a',emailAddress:'a@example.test'}});
  if(url.pathname.endsWith('/generateIds'))return reply({ids:['file-'+(++counter)]});
  if(url.pathname==='/drive/v3/files'){
   if(options.method==='POST'){const meta=JSON.parse(options.body);if(files.has(meta.id))return reply({},409);const stored={...meta,parents:['root'],shared:false,createdTime:new Date().toISOString()};files.set(meta.id,{meta:stored});return reply(stored);}
   const q=url.searchParams.get('q')||'',all=[...files.values()].map(({meta})=>meta).filter(meta=>q.includes("mimeType = 'application/vnd.google-apps.folder'")?meta.mimeType==='application/vnd.google-apps.folder'&&meta.name==='TaiwanExplorer':meta.appProperties?.purpose==='melody-taiwan-records-v1'),offset=Number(url.searchParams.get('pageToken')||0),page=all.slice(offset,offset+2);
   return reply({files:page,...(offset+2<all.length?{nextPageToken:String(offset+2)}:{})});
  }
  if(url.pathname.startsWith('/upload/drive/v3/files')){
   const parts=options.body.split('\r\n'),json=parts.filter(line=>line.startsWith('{'));const meta=JSON.parse(json[0]),content=JSON.parse(json[1]);
   if(barrier)await barrier();
   if(options.method==='PATCH'){
    const id=url.pathname.split('/').at(-1),prior=files.get(id);if(!prior)return reply({},404);
    if(options.headers['If-Match']!==String(prior.version||1))return reply({},412);
    files.set(id,{meta:{...prior.meta,...meta,...(url.searchParams.has('addParents')?{parents:[url.searchParams.get('addParents')]}:{})},content,version:(prior.version||1)+1});
   }else{if(files.has(meta.id))return reply({},409);files.set(meta.id,{meta:{...meta,createdTime:new Date().toISOString()},content,version:1});}
   if(failAfterUpload){failAfterUpload=false;throw new Error('connection lost after commit');}
   return reply({id:meta.id});
  }
  const id=url.pathname.split('/').at(-1),file=files.get(id);
  if(!file)return reply({},404);
  if(options.method==='PATCH'){if(options.headers['If-Match']&&options.headers['If-Match']!==String(file.version||1))return reply({},412);const patch=JSON.parse(options.body);if(patch.appProperties)file.meta.appProperties={...file.meta.appProperties,...patch.appProperties};file.version=(file.version||1)+1;file.meta.parents=(file.meta.parents||[]).filter(id=>!(url.searchParams.get('removeParents')||'').split(',').includes(id));if(url.searchParams.get('addParents'))file.meta.parents.push(url.searchParams.get('addParents'));return reply(file.meta);}
  return reply(url.searchParams.get('alt')==='media'?file.content:file.meta,200,browserMetadata?{}:{etag:String(file.version||1)});
 }
 return {files,request,loseReply(){failAfterUpload=true;},concurrent(){let arrivals=0,release;const gate=new Promise(r=>release=r);barrier=async()=>{if(++arrivals===2){barrier=null;release();}await gate;};}};
}
const store=(api,now=()=>Date.parse('2026-10-26T07:00:00Z'))=>createDriveStore({request:api.request,token:()=> 'test-token',uuid:()=> 'dataset-test',now});
const fileId=revision=>revision.split('~')[0];
const snapshots=api=>[...api.files.values()].filter(x=>x.meta.mimeType==='application/json');

test('same Taiwan day updates one file and a stale revision is rejected even when the file ID is unchanged',async()=>{
 const api=fakeDrive(),a=store(api),created=await a.create(document());
 assert.equal(created.datasetId,'dataset-test');assert.equal(created.revision.length,1);
 for(let i=0;i<3;i++){const current=await a.read(created.datasetId);await a.write(created.datasetId,document(),current.revision);}
 const b=store(api);assert.equal((await b.listLibraries()).length,1);assert.notDeepEqual((await b.read(created.datasetId)).revision,created.revision);
 await assert.rejects(b.write(created.datasetId,document(),created.revision),e=>e.code==='conflict');
 assert.equal(snapshots(api).length,1);assert.equal(api.files.get(fileId(created.revision[0])).content.parents.length,0);assert.equal(snapshots(api)[0].meta.name,'place-records-2026-10-26.json');
});

test('conditional daily updates retain the losing draft for explicit conflict resolution',async()=>{
 const api=fakeDrive(),a=store(api),b=store(api),root=await a.create(document());api.concurrent();
 const results=await Promise.allSettled([a.write(root.datasetId,document(),root.revision),b.write(root.datasetId,document(),root.revision)]);
 const conflict=results.find(x=>x.status==='rejected').reason;assert.equal(conflict.code,'conflict');assert.equal(snapshots(api).length,1);
 assert.equal(conflict.heads.length,1);
 const choice=await a.readHead(root.datasetId,conflict.heads[0].id);
 const resolved=await a.resolve(root.datasetId,choice.document,conflict.heads.map(x=>x.id));
 assert.equal(resolved.revision.length,1);assert.equal(snapshots(api).length,1);
 const merge=api.files.get(fileId(resolved.revision[0]));assert.equal(merge.content.parents.length,0);
 assert.deepEqual((await b.read(root.datasetId)).revision,resolved.revision);
});

test('uncertain upload retries the preallocated file ID and does not create another branch',async()=>{
 const api=fakeDrive(),a=store(api),root=await a.create(document());api.loseReply();
 await assert.rejects(a.write(root.datasetId,document(),root.revision));
 const recovered=await a.write(root.datasetId,document(),root.revision);
 assert.notDeepEqual(recovered.revision,root.revision);assert.equal(snapshots(api).length,1);
});

test('missing ancestry, mismatched envelopes and incomplete listing fail closed',async()=>{
 let time=Date.parse('2026-10-26T07:00:00Z');const api=fakeDrive(),a=store(api,()=>time),root=await a.create(document());
 api.files.get(fileId(root.revision[0])).content.datasetId='wrong';
 await assert.rejects(a.read(root.datasetId),e=>e.code==='invalid');
 api.files.get(fileId(root.revision[0])).content.datasetId=root.datasetId;
 time+=86400000;await a.write(root.datasetId,document(),root.revision);api.files.delete(fileId(root.revision[0]));
 await assert.rejects(a.read(root.datasetId),e=>e.code==='invalid');
 const incomplete=createDriveStore({token:()=> 'test-token',request:async()=>new Response(JSON.stringify({files:[],incompleteSearch:true}))});
 await assert.rejects(incomplete.listLibraries(),e=>e.code==='invalid');
});

test('auth, permission and quota errors are actionable; no unauthenticated request is sent',async()=>{
 for(const [status,code]of [[401,'auth'],[403,'permission'],[429,'quota']]){
  const a=createDriveStore({token:()=> 'test-token',request:async()=>new Response('{}',{status})});
  await assert.rejects(a.listLibraries(),e=>e.code===code);
 }
 const a=createDriveStore({token:()=> '',request:()=>assert.fail('must not send')});
 await assert.rejects(a.account(),e=>e.code==='auth');
});
test('disabled Drive API and insufficient OAuth scope have distinct setup instructions',async()=>{
 for(const payload of [
  {error:{errors:[{reason:'accessNotConfigured'}]}},
  {error:{details:[{reason:'SERVICE_DISABLED',metadata:{service:'drive.googleapis.com'}}]}}
 ]){
  const a=createDriveStore({token:()=> 'test-token',request:async()=>new Response(JSON.stringify(payload),{status:403})});
  await assert.rejects(a.account(),e=>e.code==='apiDisabled'&&e.message.includes('Google Drive API')&&e.message.includes('啟用'));
 }
 const a=createDriveStore({token:()=> 'test-token',request:async()=>new Response(JSON.stringify({error:{errors:[{reason:'insufficientPermissions'}]}}),{status:403})});
 await assert.rejects(a.account(),e=>e.code==='scope'&&e.message.includes('重新連接'));
});
test('uncertain first creation advanced by another device can still resolve using its dataset identity',async()=>{
 const api=fakeDrive(),a=store(api),b=store(api),session=createCloudSession({store:a,authorize:async()=>{}});
 await session.connect();assert.equal(session.state.phase,'empty');api.loseReply();await session.create(document());assert.equal(session.state.phase,'error');assert.equal(session.state.datasetId,'dataset-test');
 const root=await b.read('dataset-test');await b.write(root.datasetId,document(),root.revision);
 await session.retry();assert.equal(session.state.phase,'conflict');assert.equal(session.state.datasetId,'dataset-test');
 await session.resolve(session.state.heads[0].id);assert.equal(session.state.phase,'ready');assert.equal(session.state.draft,null);
});
module.exports={fakeDrive,document};

test('Taiwan midnight opens one new daily file and preserves the prior day',async()=>{
 let time=Date.parse('2026-10-26T15:59:59Z');const api=fakeDrive(),a=store(api,()=>time),first=await a.create(document()),original=JSON.stringify(snapshots(api)[0].content);
 time+=1000;const next=await a.write(first.datasetId,document(),first.revision);await a.write(first.datasetId,document(),next.revision);
 assert.deepEqual(snapshots(api).map(x=>x.meta.name),['place-records-2026-10-26.json','place-records-2026-10-27.json']);assert.equal(JSON.stringify(snapshots(api)[0].content),original);
});

test('two devices reserve the same new-day file and preserve the losing draft',async()=>{
 let time=Date.parse('2026-10-26T07:00:00Z');const api=fakeDrive(),a=store(api,()=>time),b=store(api,()=>time),first=await a.create(document());time+=86400000;api.concurrent();
 const results=await Promise.allSettled([a.write(first.datasetId,document(),first.revision),b.write(first.datasetId,document(),first.revision)]);
 assert.equal(snapshots(api).length,2);assert(results.some(x=>x.status==='rejected'&&x.reason.code==='conflict'));assert.equal((await b.read(first.datasetId)).revision.length,1);
});

test('old immutable files remain readable; first daily save preserves them and later updates reuse its file',async()=>{
 const api=fakeDrive(),a=store(api),first=await a.create(document()),old=api.files.get(fileId(first.revision[0]));delete old.meta.appProperties.day;delete old.meta.appProperties.commit;delete old.content.commit;old.meta.name='place-records-2026-10-26T07-00-00-000Z.json';
 const initial=JSON.stringify(old.content),loaded=await a.read(first.datasetId),next=await a.write(first.datasetId,document(),loaded.revision);await a.write(first.datasetId,document(),next.revision);
 assert.equal(snapshots(api).length,2);assert.equal(JSON.stringify(old.content),initial);assert.equal(snapshots(api).at(-1).meta.name,'place-records-2026-10-26.json');
});

test('missing conditional metadata stops daily updates before sending a write',async()=>{
 const api=fakeDrive(),a=store(api),first=await a.create(document());let writes=0;
 const b=createDriveStore({token:()=> 'test-token',now:()=>Date.parse('2026-10-26T07:00:00Z'),request:async(url,options)=>{if(['PATCH','PUT'].includes(options.method))writes++;const response=await api.request(url,options);response.headers.delete('etag');if(new URL(url).pathname.startsWith('/drive/v2/')){const meta=await response.json();delete meta.etag;return new Response(JSON.stringify(meta));}return response;}});
 await assert.rejects(b.write(first.datasetId,document(),first.revision),e=>e.code==='conditional');assert.equal(writes,0);assert.deepEqual((await a.read(first.datasetId)).revision,first.revision);
});
test('new snapshots live inside TaiwanExplorer and reconnect moves legacy snapshots without changing content',async()=>{
 const api=fakeDrive(),a=store(api),root=await a.create(document());
 const folders=[...api.files.values()].filter(x=>x.meta.mimeType==='application/vnd.google-apps.folder');assert.equal(folders.length,1);assert.equal(folders[0].meta.name,'TaiwanExplorer');
 const folderId=folders[0].meta.id,original=JSON.stringify(api.files.get(fileId(root.revision[0])).content);assert.deepEqual(api.files.get(fileId(root.revision[0])).meta.parents,[folderId]);
 api.files.get(fileId(root.revision[0])).meta.parents=['root'];const b=store(api);await b.listLibraries();assert.deepEqual(api.files.get(fileId(root.revision[0])).meta.parents,[folderId]);assert.equal(JSON.stringify(api.files.get(fileId(root.revision[0])).content),original);
 await b.write(root.datasetId,document(),root.revision);assert(snapshots(api).every(x=>x.meta.parents.length===1&&x.meta.parents[0]===folderId));assert.equal([...api.files.values()].filter(x=>x.meta.mimeType==='application/vnd.google-apps.folder').length,1);
});
test('shared TaiwanExplorer folders are not used for uploads or migration of private snapshots',async()=>{
 const api=fakeDrive(),a=store(api),root=await a.create(document()),shared=[...api.files.values()].find(x=>x.meta.mimeType==='application/vnd.google-apps.folder');shared.meta.shared=true;
 api.files.get(fileId(root.revision[0])).meta.parents=['root'];const b=store(api);await b.listLibraries();
 const target=api.files.get(fileId(root.revision[0])).meta.parents[0];assert.notEqual(target,shared.meta.id);assert.equal(api.files.get(target).meta.shared,false);
 // Sharing a folder after it was cached must also be detected before the next upload.
 api.files.get(target).meta.shared=true;await b.write(root.datasetId,document(),root.revision);
 const last=snapshots(api).at(-1);assert.notEqual(last.meta.parents[0],target);assert.equal(api.files.get(last.meta.parents[0]).meta.shared,false);
});



test('browser-compatible conditional updates still reject concurrent writes',async()=>{
 const api=fakeDrive({browserMetadata:true}),a=store(api),b=store(api),root=await a.create(document());api.concurrent();
 const results=await Promise.allSettled([a.write(root.datasetId,document(),root.revision),b.write(root.datasetId,document(),root.revision)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'conflict');assert.equal(snapshots(api).length,1);
});


test('browser conditional retries recover uncertain writes and keep one daily file',async()=>{
 const api=fakeDrive({browserMetadata:true}),a=store(api),root=await a.create(document());api.loseReply();
 await assert.rejects(a.write(root.datasetId,document(),root.revision),e=>e.code==='network');
 const saved=await a.write(root.datasetId,document(),root.revision);assert.equal(saved.revision.length,1);assert.equal(snapshots(api).length,1);
});
