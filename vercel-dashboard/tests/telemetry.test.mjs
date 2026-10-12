import {test} from 'node:test';
import assert from 'node:assert/strict';
import {telemetrySchema,makeSnapshot,mergeClientSnapshot,isClientSnapshotFresh,needsHardwareAttention} from '../lib/telemetry.ts';
const sample={device:'edith-01',boot:'test',seq:1,capturedAt:Date.now(),location:'EDITH Field Station',temperature:28,humidity:62,pressure:1012,gas:430,smoke:'clear',quaternion:[1,0,0,0],health:{bmp:true,dht:true,mpu:true,mq:'monitoring',calibrated:true},uptime:123,rssi:-50};
test('accepts the exact ESP32 telemetry contract',()=>assert.equal(telemetrySchema.safeParse(sample).success,true));
test('MQ-2 rail readings remain visible without a core-sensor fault or false clear-air claim',()=>{
 const raw={...sample,gas:0,smoke:'unknown',health:{...sample.health,mq:'suspect'}};
 assert.equal(telemetrySchema.safeParse(raw).success,true);
 assert.equal(needsHardwareAttention(raw.health),false);
 assert.equal(telemetrySchema.safeParse({...raw,smoke:'clear'}).success,false);
 for(const key of ['bmp','dht','mpu','calibrated'])assert.equal(needsHardwareAttention({...raw.health,[key]:false}),true);
});
test('rejects impossible readings and non-unit quaternions',()=>{for(const change of [{humidity:101},{temperature:NaN},{quaternion:[2,0,0,0]},{gas:5000},{rssi:2}])assert.equal(telemetrySchema.safeParse({...sample,...change}).success,false);});
test('failed sensors must invalidate measurements',()=>assert.equal(telemetrySchema.safeParse({...sample,health:{...sample.health,bmp:false}}).success,false));
test('allows honest missing-sensor telemetry',()=>assert.equal(telemetrySchema.safeParse({...sample,temperature:null,pressure:null,humidity:null,quaternion:null,health:{...sample.health,bmp:false,dht:false,mpu:false,calibrated:false}}).success,true));
test('rejects fake device IDs, stale aliases, and secret fields',()=>{for(const change of [{device:'other'},{sd:true},{deviceToken:'secret'}])assert.equal(telemetrySchema.safeParse({...sample,...change}).success,false);});
test('stale samples remain offline even after a delayed delivery',()=>{const now=Date.now();assert.equal(makeSnapshot({...sample,capturedAt:now-9000},now,now).online,false);assert.equal(makeSnapshot(sample,now-9000,now).online,false);assert.equal(makeSnapshot(null,null).online,false);assert.equal(makeSnapshot({...sample,capturedAt:now},now,now).online,true);});
test('interrupted updates retain readings without extending their freshness',()=>{
 const start=100000,wire={data:sample,receivedAt:50000,ageMs:1000,online:true};
 const initial=mergeClientSnapshot(makeSnapshot(null,null),wire,start);
 assert.equal(initial.receivedAt,start-1000); // Server/browser clocks may differ.
 assert.equal(isClientSnapshotFresh(initial,start+2000),true);
 const duplicate=mergeClientSnapshot(initial,{...wire,ageMs:0},start+6000);
 assert.equal(duplicate,initial);
 const empty=mergeClientSnapshot(duplicate,makeSnapshot(null,null),start+7000);
 assert.equal(empty.data.humidity,sample.humidity);
 assert.equal(isClientSnapshotFresh(empty,start+7000),false);
 const resumed=mergeClientSnapshot(empty,{...wire,data:{...sample,seq:2,humidity:55},ageMs:200},start+20000);
 assert.equal(resumed.data.humidity,55);
 assert.equal(isClientSnapshotFresh(resumed,start+20000),true);
 assert.equal(mergeClientSnapshot(resumed,wire,start+21000),resumed);
});
test('new samples replace old values even for sensor faults and device restarts',()=>{
 const prior=mergeClientSnapshot(makeSnapshot(null,null),{data:sample,receivedAt:0,ageMs:0,online:true},1000);
 const failedSensor={...sample,seq:2,humidity:null,health:{...sample.health,dht:false}};
 const next=mergeClientSnapshot(prior,{data:failedSensor,receivedAt:0,ageMs:0,online:true},2000);
 assert.equal(next.data.humidity,null); // Never substitute an older good reading for a failed sensor.
 const restarted=mergeClientSnapshot(next,{data:{...sample,boot:'new-boot',seq:1},receivedAt:0,ageMs:0,online:true},3000);
 assert.equal(restarted.data.boot,'new-boot');
 assert.equal(isClientSnapshotFresh(makeSnapshot(null,null),3000),false);
});
