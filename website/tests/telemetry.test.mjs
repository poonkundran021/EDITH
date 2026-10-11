import {test} from 'node:test';
import assert from 'node:assert/strict';
import {telemetrySchema,makeSnapshot,needsHardwareAttention} from '../lib/telemetry.ts';
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
