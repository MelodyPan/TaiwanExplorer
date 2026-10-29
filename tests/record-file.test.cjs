const {test}=require('node:test'),assert=require('node:assert/strict');
const {createDataFile,readDataFile}=require('../src/assets/records/record-file.js');
test('personal record values round trip and do not include public place data',()=>{const records={'1':{rating:4,visited:true,parking:false,seasonal:true,seasonalNote:'3–4 月賞櫻'}};const data=createDataFile(records);assert.deepEqual(readDataFile(JSON.stringify(data)).records,records);assert(!('places' in data));});
test('unrated and unknown fields remain unset',()=>{assert.deepEqual(createDataFile({'2':{rating:null,visited:null,parking:null,seasonal:null,seasonalNote:''}}).records['2'].rating,null);});
test('reject invalid ratings, ids and conditional seasonal explanation',()=>{for(const records of [{'0':{}},{'1':{rating:6}},{'1':{rating:2.5}},{'1':{visited:'yes'}},{'1':{seasonal:false,seasonalNote:'oops'}},{'1':{seasonal:true,seasonalNote:'x'.repeat(1001)}}])assert.throws(()=>createDataFile(records));assert.throws(()=>readDataFile('{"schemaVersion":99,"records":{}}'));});
test('empty records initialize independently',()=>{const a=createDataFile(),b=createDataFile();a.records['1']={};assert.deepEqual(b.records,{});});
