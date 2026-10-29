// 私人 Drive 儲存：重用當日檔案，以條件寫入保護版本，衝突必須明確選擇。
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./record-file.js'));else root.RecordDrive=factory(root.RecordFile);})(globalThis,function(file){
 'use strict';
 const PURPOSE='melody-taiwan-records-v1',API='https://www.googleapis.com/drive/v3';
 class DriveError extends Error{constructor(code,message,details={}){super(message);this.name='DriveError';this.code=code;Object.assign(this,details);}}
 const invalid=()=>new DriveError('invalid','Drive 地點紀錄版本不完整或格式錯誤，已停止載入；請保留備份，不要刪除版本檔。');
 const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);
 const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
 function checked(document){try{file.readDataFile(JSON.stringify(document));return structuredClone(document);}catch{throw invalid();}}
 // 每日檔案的 ID 不變、內容會變；commit 才能分辨同一天不同修改，舊版本仍接受純 ID。
 const revisionKey=meta=>meta.appProperties.commit?meta.id+'~'+meta.appProperties.commit:meta.id;
 const taipeiDay=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
 function createDriveStore({request=globalThis.fetch.bind(globalThis),token,uuid=()=>globalThis.crypto.randomUUID(),now=Date.now}={}){
  let pending=null,folderId='',folderRequestId='',folderTask=null;
  async function call(url,options={}){
   const credential=token?.();if(!credential)throw new DriveError('auth','請連接 Google Drive 後再試。');
   let response;try{response=await request(url,{...options,headers:{...options.headers,Authorization:'Bearer '+credential},signal:AbortSignal.timeout(30000)});}catch{throw new DriveError('network','無法連線 Google Drive；未同步內容仍在目前分頁，請重試或下載備份。');}
   if(response.ok)return response;
   let apiError={};try{apiError=(await response.clone().json()).error||{};}catch{}
   const reasons=[...(apiError.errors||[]),...(apiError.details||[])].map(item=>item?.reason).filter(value=>typeof value==='string');
   if(response.status===403&&reasons.some(reason=>['accessNotConfigured','SERVICE_DISABLED','API_DISABLED'].includes(reason)))throw new DriveError('apiDisabled','此 Google 專案尚未啟用 Google Drive API。請到 Google Cloud Console 的 API 程式庫啟用 Google Drive API，再重新連接；地點紀錄仍儲存在你的 Google Drive。');
   if(response.status===403&&reasons.some(reason=>['insufficientPermissions','ACCESS_TOKEN_SCOPE_INSUFFICIENT'].includes(reason)))throw new DriveError('scope','Google Drive 授權範圍不足，請重新連接並允許網站存取它建立的地點紀錄檔案。');
   if(response.status===401)throw new DriveError('auth','Google 授權已過期，請重新連接同一帳號。');
   if(response.status===429||reasons.some(reason=>/rateLimit|quota|storageQuota/i.test(reason)))throw new DriveError('quota','Google Drive 空間或請求額度不足，請稍後重試或檢查容量。');
   if(response.status===403)throw new DriveError('permission','Google Drive 拒絕存取，請確認已授予地點紀錄檔案權限。');
   if(response.status===404)throw new DriveError('missing','找不到 Drive 地點紀錄版本；請確認帳號、權限或垃圾桶。');
   if(response.status===409)throw new DriveError('exists','版本檔已存在。');
   if(response.status===412)throw new DriveError('changed','另一台裝置已更新當日地點紀錄，請選擇要繼續使用的版本。');
   throw new DriveError('service','Google Drive 暫時無法完成操作，請重試。');
  }
  async function list(folderSearch=false){
   const files=[],pages=new Set();let pageToken='';
   do{
    const url=new URL(API+'/files');url.searchParams.set('q',"trashed = false and 'me' in owners and "+(folderSearch?"name = 'TaiwanExplorer' and mimeType = 'application/vnd.google-apps.folder'":"appProperties has { key='purpose' and value='"+PURPOSE+"' }"));
    url.searchParams.set('fields','nextPageToken,incompleteSearch,files(id,name,mimeType,parents,shared,appProperties,createdTime)');url.searchParams.set('pageSize','1000');url.searchParams.set('spaces','drive');if(pageToken)url.searchParams.set('pageToken',pageToken);
    const result=await(await call(url.href)).json();if(!Array.isArray(result.files)||result.incompleteSearch)throw invalid();
    for(const meta of result.files){if(!validId(meta.id)||(folderSearch?meta.name!=='TaiwanExplorer'||meta.mimeType!=='application/vnd.google-apps.folder':meta.appProperties?.purpose!==PURPOSE||!validId(meta.appProperties.dataset)))throw invalid();files.push(meta);}
    pageToken=result.nextPageToken||'';if(pageToken&&pages.has(pageToken))throw invalid();pages.add(pageToken);
   }while(pageToken);
   if(new Set(files.map(x=>x.id)).size!==files.length)throw invalid();return files;
  }
  // 不只依資料夾名稱判斷：還要有應用程式標記且 shared=false，避免私人資料流入同名分享資料夾。
  async function ensureFolder(){
   if(folderTask)return folderTask;
   folderTask=(async()=>{
    const isPrivate=meta=>meta?.shared===false&&meta.appProperties?.purpose===PURPOSE+'-folder'&&meta.mimeType==='application/vnd.google-apps.folder';
    if(folderId){try{const current=await(await call(API+'/files/'+encodeURIComponent(folderId)+'?fields=id,name,mimeType,shared,appProperties')).json();if(isPrivate(current)&&current.name==='TaiwanExplorer')return folderId;}catch(error){if(error.code!=='missing')throw error;}folderId='';}
    let folders=(await list(true)).filter(isPrivate);
    if(!folders.length){
     if(!folderRequestId){folderRequestId=(await(await call(API+'/files/generateIds?count=1&space=drive&type=files')).json()).ids?.[0];if(!validId(folderRequestId))throw invalid();}
     const meta={id:folderRequestId,name:'TaiwanExplorer',mimeType:'application/vnd.google-apps.folder',appProperties:{purpose:PURPOSE+'-folder'}};
     let created;
     try{created=await(await call(API+'/files?fields=id,name,mimeType,shared,appProperties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)})).json();}
     catch(error){if(error.code!=='exists')throw error;created=await(await call(API+'/files/'+encodeURIComponent(folderRequestId)+'?fields=id,name,mimeType,shared,appProperties')).json();}
     if(!isPrivate(created)||created.name!==meta.name)throw new DriveError('folderPrivacy','無法確認 TaiwanExplorer 資料夾為私人，已暫停移動與上傳。請確認資料夾未被分享。');
     // 另一台裝置可能同時建立相同應用資料夾，重新列出後再選定一致目標。
     folders=(await list(true)).filter(isPrivate);if(!folders.length)folders=[created];
    }
    folderId=folders.map(x=>x.id).sort()[0];folderRequestId='';return folderId;
   })().finally(()=>{folderTask=null;});return folderTask;
  }
  async function organize(files){
   if(!files.length)return;const target=await ensureFolder();
   for(const meta of files){if(meta.parents?.includes(target))continue;
    const url=new URL(API+'/files/'+encodeURIComponent(meta.id));url.searchParams.set('addParents',target);url.searchParams.set('fields','id,parents');if(meta.parents?.length)url.searchParams.set('removeParents',meta.parents.join(','));
    await call(url.href,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
   }
  }
  async function download(meta){
   const envelope=await(await call(API+'/files/'+encodeURIComponent(meta.id)+'?alt=media')).json();
   const props=meta.appProperties;
   if(!!props.day!==!!props.commit)throw invalid();
   if(props.day&&(!/^\d{4}-\d{2}-\d{2}$/.test(props.day)||!validId(props.commit)||envelope.commit!==props.commit))throw invalid();
   if(envelope?.format!==1||envelope.datasetId!==props.dataset||!Array.isArray(envelope.parents)||envelope.parents.some(x=>!validId(x)||x===meta.id)||new Set(envelope.parents).size!==envelope.parents.length)throw invalid();
   if(props.merge==='1'){if(envelope.parents.length<2||props.parent!==envelope.parents[0])throw invalid();}
   else if(!same(envelope.parents,props.parent?[props.parent]:[]))throw invalid();
   return {envelope,document:checked(envelope.data)};
  }
  // 以實際檔案 ID 建父子關係，拒絕缺漏祖先與循環；revision 則另含當日內容 commit。
  async function graph(datasetId){
   if(!validId(datasetId))throw invalid();
   const nodes=(await list()).filter(x=>x.appProperties.dataset===datasetId);if(!nodes.length)throw new DriveError('missing','找不到這份雲端地點紀錄；不會自動建立空資料覆蓋。');
   const ids=new Set(nodes.map(x=>x.id)),parents=new Map();
   for(const meta of nodes){const p=meta.appProperties;let references=p.parent?[p.parent]:[];if(p.merge==='1')references=(await download(meta)).envelope.parents;
    if(references.some(id=>!validId(id)||id===meta.id||!ids.has(id)))throw invalid();parents.set(meta.id,references);
   }
   // 迭代驗證祖先關係，避免損壞版本圖隱藏分支或形成無窮循環。
   const done=new Set();
   for(const meta of nodes){const visiting=new Set(),stack=[[meta.id,false]];while(stack.length){const [id,exit]=stack.pop();if(done.has(id))continue;if(exit){visiting.delete(id);done.add(id);continue;}if(visiting.has(id))throw invalid();visiting.add(id);stack.push([id,true]);for(const parent of parents.get(id))stack.push([parent,false]);}}
   const referenced=new Set([...parents.values()].flat()),heads=nodes.filter(x=>!referenced.has(x.id));if(!heads.length)throw invalid();
   return {nodes,heads,revision:heads.map(revisionKey).sort()};
  }
  const choices=g=>g.heads.map(x=>({id:revisionKey(x),name:x.name,createdTime:x.createdTime}));
  const conflict=g=>new DriveError('conflict','雲端有不同版本；請選擇雲端內容或目前分頁的未同步草稿繼續使用。',{heads:choices(g),revision:g.revision});
  async function read(datasetId){const g=await graph(datasetId);if(g.heads.length!==1)throw conflict(g);const {document}=await download(g.heads[0]);return {datasetId,document,revision:g.revision,heads:choices(g)};}
  async function readHead(datasetId,id){const g=await graph(datasetId),meta=g.heads.find(x=>revisionKey(x)===id);if(!meta)throw conflict(g);return {datasetId,document:(await download(meta)).document,revision:g.revision,heads:choices(g)};}
  const privateProperties=props=>Object.entries(props).map(([key,value])=>({key,value,visibility:'PRIVATE'}));
  // 回傳的 meta 與 ETag 必須是同次讀取的一致快照，且條件式寫入要用同一 API 版本。
  async function conditionalFile(id){
   const response=await call(API+'/files/'+encodeURIComponent(id)+'?fields=id,parents,appProperties'),meta=await response.json(),etag=response.headers.get('etag');
   if(etag)return {meta,etag,version:'v3'};
   // 瀏覽器未必讀得到 v3 的 ETag；改用 v2 JSON 內的 ETag 時，寫入也必須用 v2。
   // v3 讀不到 ETag 時，用 v2 JSON 取回；同時重讀私有屬性，不能拿新 ETag 配舊 commit。
   const legacy=await(await call('https://www.googleapis.com/drive/v2/files/'+encodeURIComponent(id)+'?fields=id,etag,parents(id),properties(key,value,visibility)')).json();
   if(typeof legacy.etag!=='string'||!legacy.etag||legacy.etag.startsWith('W/'))throw new DriveError('conditional','無法取得 Google Drive 檔案版本，已保留未同步資料；請稍後重試。');
   if(legacy.id!==id||!Array.isArray(legacy.properties)||!Array.isArray(legacy.parents))throw invalid();
   return {meta:{id:legacy.id,parents:legacy.parents.map(p=>p.id),appProperties:Object.fromEntries(legacy.properties.filter(p=>p.visibility==='PRIVATE').map(p=>[p.key,p.value]))},etag:legacy.etag,version:'v2'};
  }
  // 跨日先在舊 head 預約新檔 ID，再建立檔案；兩台裝置因此爭用同一 ID，不各生一份。
  async function reserveDay(operation){
   // 跨日前先在舊 head 預約新 ID，兩台裝置共用同一 ID，避免同名卻不同檔。
   for(let attempt=0;attempt<3;attempt++){
    const {meta:base,etag,version}=await conditionalFile(operation.baseId);
    if(revisionKey(base)!==operation.baseRevision){pending=null;throw conflict(await graph(operation.datasetId));}
    if(base.appProperties.nextDay===operation.day&&validId(base.appProperties.nextFile)){operation.id=base.appProperties.nextFile;return;}
    const reservation={nextDay:operation.day,nextFile:operation.commit};
    try{await call('https://www.googleapis.com/drive/'+version+'/files/'+encodeURIComponent(operation.baseId)+'?fields=id',{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify(version==='v2'?{properties:privateProperties({...base.appProperties,...reservation})}:{appProperties:reservation})});operation.id=operation.commit;return;}
    catch(error){if(error.code!=='changed')throw error;}
   }
   throw new DriveError('network','其他裝置正在建立當日檔案，請稍後重試。');
  }
  async function upload(operation){
   const parentFolder=await ensureFolder();
   if(!operation.commit){const generated=await(await call(API+'/files/generateIds?count=1&space=drive&type=files')).json();operation.commit=generated.ids?.[0];if(!validId(operation.commit))throw invalid();}
   if(!operation.id&&operation.baseId)await reserveDay(operation);
   if(!operation.id)operation.id=operation.commit;
   const props={purpose:PURPOSE,dataset:operation.datasetId,day:operation.day,commit:operation.commit,parent:operation.parents[0]||'',merge:operation.parents.length>1?'1':'0'};
   const meta={id:operation.id,name:'place-records-'+operation.day+'.json',mimeType:'application/json',parents:[parentFolder],appProperties:props};
   const envelope={format:1,datasetId:operation.datasetId,commit:operation.commit,parents:operation.parents,data:operation.document};
   let etag='',moveQuery='',version='v3',currentProperties={};
   if(operation.update){
    const conditional=await conditionalFile(operation.id),current=conditional.meta;etag=conditional.etag;version=conditional.version;currentProperties=current.appProperties;
    // 可能是上次已成功、只有回應遺失；先核對完整內容，確認後視為同一次寫入完成。
    if(current.appProperties?.commit===operation.commit){const stored=await download(current);if(JSON.stringify(stored.envelope)!==JSON.stringify(envelope))throw invalid();return meta;}
    if(revisionKey(current)!==operation.previous){pending=null;throw conflict(await graph(operation.datasetId));}
    if(current.appProperties.nextDay&&current.appProperties.nextDay>operation.day){pending=null;throw conflict(await graph(operation.datasetId));}
    if(!current.parents?.includes(parentFolder)){moveQuery='&addParents='+encodeURIComponent(parentFolder);if(current.parents?.length)moveQuery+='&removeParents='+encodeURIComponent(current.parents.join(','));}
   }
   // Drive 更新的 multipart metadata 不可改 id 或 parents，移動父資料夾須走網址參數。
   const uploadMeta=version==='v2'?{title:meta.name,mimeType:meta.mimeType,properties:privateProperties({...currentProperties,...props})}:operation.update?{name:meta.name,mimeType:meta.mimeType,appProperties:props}:meta;
   const boundary='bookmark_'+uuid(),body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(uploadMeta)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(envelope)+'\r\n--'+boundary+'--';
   if(new TextEncoder().encode(body).length>5*1024*1024)throw new DriveError('size','地點紀錄資料超過 5 MB，請先下載備份並縮減資料。');
   try{await call('https://www.googleapis.com/upload/drive/'+version+'/files'+(operation.update?'/'+encodeURIComponent(operation.id):'')+'?uploadType=multipart&fields=id'+moveQuery,{method:version==='v2'?'PUT':operation.update?'PATCH':'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary,...(etag?{'If-Match':etag}:{})},body});}
   catch(error){if(error.code==='changed'){pending=null;throw conflict(await graph(operation.datasetId));}if(error.code!=='exists')throw error;const existing=await(await call(API+'/files/'+encodeURIComponent(operation.id)+'?fields=id,appProperties')).json();const stored=await download(existing);if(JSON.stringify(stored.envelope)!==JSON.stringify(envelope)){pending=null;throw conflict(await graph(operation.datasetId));}}
   return meta;
  }
  // pending 保留尚未確認的操作，只有原資料與版本條件相同才允許重試，不任意換草稿。
  async function commit(datasetId,document,expectedHeads,isCreate=false){
   const next=checked(document),normalized=JSON.stringify(file.readDataFile(JSON.stringify(next)));
   if(pending){if(pending.datasetId!==datasetId||!same(pending.expected,expectedHeads)||pending.normalized!==normalized)throw new DriveError('pending','前一次儲存尚未確認，請先重試原草稿。');}
   else{
    let current;if(!isCreate){current=await graph(datasetId);if(!same(current.revision,expectedHeads))throw conflict(current);}
    const day=taipeiDay(now()),target=current?.heads.find(x=>x.appProperties.day===day);
    let parents=current?.heads.map(x=>x.id)||[];
    // 重用當日檔必須沿用其原父關係並排除自己，否則會在版本圖建立自我循環。
    if(target){const prior=(await download(target)).envelope.parents;parents=[...new Set([...parents.filter(id=>id!==target.id),...prior])];}
    const base=current?.heads.slice().sort((a,b)=>a.id.localeCompare(b.id))[0];
    pending={datasetId,document:next,parents:parents.sort(),expected:[...expectedHeads],normalized,day,...(target?{id:target.id,update:true,previous:revisionKey(target)}:base?{baseId:base.id,baseRevision:revisionKey(base)}:{})};
   }
   // 上傳成功仍需確認 Drive 列表與最新 head；尚未列出時保留 pending 供重試，不能報成功。
   const own=await upload(pending);const current=await graph(datasetId);
   if(!current.nodes.some(x=>x.id===own.id))throw new DriveError('network','Drive 尚未列出剛上傳的版本，請保留分頁並重試確認。');
   pending=null;if(current.heads.length!==1||revisionKey(current.heads[0])!==revisionKey(own))throw conflict(current);
   return {datasetId,document:next,revision:current.revision,heads:choices(current)};
  }
  return {
   async account(){const user=(await(await call(API+'/about?fields=user(permissionId,emailAddress,displayName)')).json()).user;if(!user?.permissionId)throw invalid();return {id:user.permissionId,email:user.emailAddress||'',name:user.displayName||''};},
   async listLibraries(){const all=await list();await organize(all);const groups=new Map();for(const meta of all){const id=meta.appProperties.dataset,group=groups.get(id)||{id,name:'我的地點紀錄',createdTime:meta.createdTime};if(meta.createdTime<group.createdTime)group.createdTime=meta.createdTime;groups.set(id,group);}return [...groups.values()];},
   async create(document){const id=pending?.datasetId||uuid();try{return await commit(id,document,[],true);}catch(error){error.datasetId=id;throw error;}},
   read,readHead,write:(id,document,revision)=>commit(id,document,revision),resolve:(id,document,revision)=>commit(id,document,revision),
   reset(){pending=null;folderId='';folderRequestId='';folderTask=null;}
  };
 }
 return {createDriveStore,DriveError};
});
