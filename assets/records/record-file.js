// Personal records only. Public place data and credentials never enter this document.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RecordFile=factory();})(globalThis,function(){
 'use strict';
 function readDataFile(text){
  const data=JSON.parse(text),bad=()=>{throw new Error('地點紀錄格式錯誤，請保留備份。');};
  if(!data||data.schemaVersion!==1||!data.records||Array.isArray(data.records)||typeof data.records!=='object'||typeof data.updatedAt!=='string'||!Number.isFinite(Date.parse(data.updatedAt)))bad();
  if(Object.keys(data.records).length>10000)bad();
  for(const [id,r] of Object.entries(data.records)){
   if(!/^[1-9][0-9]{0,14}$/.test(id)||!r||typeof r!=='object'||Array.isArray(r))bad();
   if(r.rating!==null&&(!Number.isInteger(r.rating)||r.rating<1||r.rating>5))bad();
   for(const key of ['visited','parking','seasonal'])if(r[key]!==null&&typeof r[key]!=='boolean')bad();
   if(typeof r.seasonalNote!=='string'||r.seasonalNote.length>1000||r.seasonal!==true&&r.seasonalNote!=='')bad();
   if(Object.keys(r).some(k=>!['rating','visited','parking','seasonal','seasonalNote'].includes(k)))bad();
  }
  if(Object.keys(data).some(k=>!['schemaVersion','records','updatedAt'].includes(k)))bad();
  return data;
 }
 function createDataFile(records={},updatedAt=new Date().toISOString()){return readDataFile(JSON.stringify({schemaVersion:1,records,updatedAt}));}
 return {createDataFile,readDataFile};
});
