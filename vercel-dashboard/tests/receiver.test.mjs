import test from 'node:test';
import assert from 'node:assert/strict';
import { readReceiver } from '../lib/receiver.ts';

const time = 1800000000000;
const data = {device:'edith-01',boot:'test',seq:1,capturedAt:time,location:'Test',temperature:25,humidity:null,pressure:1000,gas:0,smoke:'unknown',quaternion:null,health:{bmp:true,dht:false,mpu:false,mq:'suspect',calibrated:false},uptime:1,rssi:-50};
const source = 'https://example.com/api/telemetry';
test('keeps real sensor nulls and requests uncached readings', async () => {
  const snapshot = await readReceiver(source, async (url, options) => {
    assert.equal(url,source);
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers.Authorization,undefined);
    return Response.json({data,receivedAt:time,online:true});
  }, () => time+1000);
  assert.equal(snapshot.online,true);
  assert.equal(snapshot.data.humidity,null);
});
test('recalculates freshness instead of trusting upstream online flag', async () => {
  const snapshot = await readReceiver(source, async () => Response.json({data,receivedAt:time,online:true}), () => time+9000);
  assert.equal(snapshot.online,false);
});
test('empty receiver stays offline', async () => {
  const snapshot = await readReceiver(source, async () => Response.json({data:null,receivedAt:null}), () => time);
  assert.equal(snapshot.online,false);
});
test('rejects unavailable or malformed receiver responses', async () => {
  await assert.rejects(readReceiver(source, async () => new Response('',{status:503})));
  await assert.rejects(readReceiver(source, async () => Response.json({data:{humidity:55},receivedAt:time})));
});
