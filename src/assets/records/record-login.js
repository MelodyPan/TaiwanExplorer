// 目前分頁只暫存授權資訊；地點正式資料仍在私人 Drive。
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RecordLogin=factory();})(globalThis,function(){
 'use strict';
 // 只記錄 Google 實際回傳的正秒數與取得時間，不把 access token 混入顯示資訊。
 function tokenDetails(response,receivedAt=Date.now()){const seconds=Number(response?.expires_in);return Number.isFinite(seconds)&&seconds>0?{expiresIn:seconds,receivedAt}:null;}
 function createLoginCache({storage,now=Date.now,clientId}){
  const key='taiwan-explorer-drive-login-v1';
  function clear(){try{storage?.removeItem(key);}catch{}}
  // Client ID 不同或憑證已到期就清除，F5 不能讓過期授權復活。
  function read(){try{const value=JSON.parse(storage?.getItem(key)||'null'),time=now();if(value&&value.clientId===clientId&&typeof value.token==='string'&&value.token&&Number.isFinite(value.expires)&&time<value.expires)return value;}catch{}clear();return null;}
  function write(value){try{storage?.setItem(key,JSON.stringify(value));}catch{}}
  // limit 保留舊呼叫介面；地點紀錄目前傳 undefined，不再採用十小時續期或閒置延長。
  function save(token,expires,limit,details){write({token,expires,limit,clientId,...(details?{tokenDetails:{expiresIn:details.expiresIn,receivedAt:details.receivedAt}}:{})});}
  return {read,save,clear};
 }
 return {createLoginCache,tokenDetails};
});
