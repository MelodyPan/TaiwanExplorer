const {test}=require('node:test'),assert=require('node:assert/strict');
const {createLoginCache}=require('../src/assets/records/record-login.js');
test('reported token lifetime stores only actual Google seconds and survives reload',()=>{
 const {tokenDetails}=require('../src/assets/records/record-login.js');
 const details=tokenDetails({access_token:'do-not-display',expires_in:3599},1000);assert.deepEqual(details,{expiresIn:3599,receivedAt:1000});assert.equal(tokenDetails({},1000),null);
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},cache=createLoginCache({storage,now:()=>1000,clientId:'client'});
 cache.save('test-token',999999,999999,details);assert.deepEqual(cache.read().tokenDetails,details);assert(!JSON.stringify(cache.read().tokenDetails).includes('do-not-display'));
});
test('reload retains authorization until Google expiry, expiry cannot revive it',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let now=1000;
 const make=()=>createLoginCache({storage,now:()=>now,clientId:'client'});
 const first=make();first.save('token',now+3600000);now+=1800000;
 assert.equal(make().read().token,'token');now+=1799999;assert.equal(make().read().token,'token');now+=1;
 assert.equal(make().read(),null);assert.equal(values.size,0);
});
test('Google expiration, client mismatch, explicit logout and malformed storage clear credentials',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let now=1000;
 const cache=createLoginCache({storage,now:()=>now,clientId:'one'});cache.save('token',2000);now=2000;assert.equal(cache.read(),null);
 cache.save('token',9000);assert.equal(createLoginCache({storage,now:()=>now,clientId:'two'}).read(),null);
 cache.save('token',9000);cache.clear();assert.equal(cache.read(),null);
 values.set('taiwan-explorer-drive-login-v1','bad');assert.equal(cache.read(),null);
});
