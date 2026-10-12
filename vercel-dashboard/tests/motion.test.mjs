import test from 'node:test';
import assert from 'node:assert/strict';
import {orientationBlend,telemetryPollDelay} from '../lib/motion.ts';

test('orientation converges equally at 30, 60 and 120 Hz without overshooting',()=>{
 const errors=[30,60,120].map(fps=>{
  let error=1;
  for(let i=0;i<fps/10;i++)error*=1-orientationBlend(1/fps);
  return error;
 });
 for(const error of errors)assert.ok(Math.abs(error-Math.exp(-4))<1e-10);
 for(const dt of [0,1/120,1/60,.5,NaN,-1])assert.ok(orientationBlend(dt)>=0&&orientationBlend(dt)<=1);
});
test('network time counts toward polling cadence and failures still back off',()=>{
 assert.equal(telemetryPollDelay(80,0,false,false),170);
 assert.equal(telemetryPollDelay(650,0,false,false),25);
 assert.equal(telemetryPollDelay(30,1,false,false),1000);
 assert.equal(telemetryPollDelay(30,8,false,false),5000);
 assert.equal(telemetryPollDelay(30,0,true,false),5000);
 assert.equal(telemetryPollDelay(0,0,false,true),250);
});
