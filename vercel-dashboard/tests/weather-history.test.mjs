import test from 'node:test';
import assert from 'node:assert/strict';
import {seasonalDistance,summarizeHistory,getWeatherHistory,historyText} from '../lib/weather-history.ts';
import {EDITH_STATION,sensorComparison,addWeatherInsights} from '../lib/weather-insights.ts';

const now=new Date('2026-10-12T12:00:00Z');
const rows=[];
for(let d=new Date('2021-01-01');d<new Date('2026-01-01');d.setUTCDate(d.getUTCDate()+1))rows.push({date:d.toISOString().slice(0,10),high:32,low:24,rain:d.getUTCDate()%2?2:0});
const archive={daily:{time:rows.map(d=>d.date),temperature_2m_max:rows.map(d=>d.high),temperature_2m_min:rows.map(d=>d.low),precipitation_sum:rows.map(d=>d.rain)}};
test('five full years use same-season samples and preserve missing rain',()=>{
 const h=summarizeHistory(rows,'2026-10-31',2021,2025,'source');
 assert.equal(h.datasetDays,1826);assert.equal(h.sampleDays,75);assert.equal(h.high,32);assert.equal(h.low,24);assert.equal(h.years.length,5);
 const missing=summarizeHistory(rows.map(d=>({...d,rain:d.date.endsWith('10-31')?null:d.rain})),'2026-10-31',2021,2025,'source');
 assert.equal(missing.rainSamples,70);
 assert.match(historyText(h,'en'),/NOT your event's rain probability/);assert.match(historyText(h,'ta'),/முன்னறிவிப்பு அல்ல/);
 assert.throws(()=>summarizeHistory(rows.filter(d=>!d.date.startsWith('2023')),'2026-10-31',2021,2025,'source'),/Incomplete/);
});
test('seasonal windows wrap New Year and handle leap dates',()=>{
 assert.equal(seasonalDistance('2021-12-31','2026-01-01'),1);
 assert.equal(seasonalDistance('2021-02-28','2028-02-29'),0);
 assert.equal(seasonalDistance('2024-02-29','2028-02-29'),0);
 assert.equal(summarizeHistory(rows,'2027-01-01',2021,2025,'source').sampleDays,75);
});
test('future requests fetch last five completed years and reuse archive for another date',async()=>{
 let count=0;
 const fetcher=async input=>{count++;const u=new URL(input);assert.equal(u.searchParams.get('start_date'),'2021-01-01');assert.equal(u.searchParams.get('end_date'),'2025-12-31');assert.equal(u.searchParams.get('models'),'era5');return Response.json(archive);};
 await getWeatherHistory(EDITH_STATION,'2029-10-31',now,fetcher);
 await getWeatherHistory(EDITH_STATION,'2026-11-01',now,fetcher);
 assert.equal(count,1);
});
test('malformed archives and places outside Tamil Nadu are rejected',async()=>{
 await assert.rejects(getWeatherHistory({...EDITH_STATION,latitude:9},'2026-10-31',now,async()=>Response.json({daily:{...archive.daily,precipitation_sum:[0]}})),/Incomplete/);
 await assert.rejects(getWeatherHistory({...EDITH_STATION,admin1:'Kerala'},'2026-10-31',now,async()=>{throw Error('must not fetch');}),/Tamil Nadu/);
});
test('unrelated locations and stale telemetry are excluded from sensor comparison',async()=>{
 let count=0;
 const fetcher=async()=>{count++;return Response.json({data:null,online:false,ageMs:null});};
 assert.match(await sensorComparison({...EDITH_STATION,name:'Chennai',latitude:13},EDITH_STATION,'en',fetcher),/not used/);
 assert.equal(count,0);
 assert.match(await sensorComparison(EDITH_STATION,EDITH_STATION,'en',fetcher),/Stale readings were excluded/);assert.equal(count,1);
});
test('fresh local comparison reports sensor differences without altering future forecast',async()=>{
 const data={device:'edith-01',boot:'test',seq:1,capturedAt:now.getTime(),location:'EDITH Field Station',temperature:30,humidity:60,pressure:1000,gas:null,smoke:'unknown',quaternion:null,health:{bmp:true,dht:true,mpu:false,mq:'suspect',calibrated:false},uptime:1,rssi:-50};
 const fetcher=async input=>input==='/api/telemetry'?Response.json({data,ageMs:100,online:true}):Response.json({current:{time:'2026-10-12T17:30',temperature_2m:28,relative_humidity_2m:65,surface_pressure:1002}});
 const text=await sensorComparison(EDITH_STATION,EDITH_STATION,'en',fetcher);
 assert.match(text,/\+2.0°C and -5.0/);assert.match(text,/does not adjust the future forecast/);
});
test('archive failure preserves forecast and does not invent seasonal data',async()=>{
 const reply={text:'Forecast: 30°C',kind:'answer',place:{...EDITH_STATION,latitude:10},date:'2026-10-13'};
 const r=await addWeatherInsights(reply,'en',EDITH_STATION,now,async()=>new Response('',{status:503}));
 assert.equal(r.history,undefined);assert.match(r.text,/Forecast: 30°C/);assert.match(r.text,/No seasonal estimate was invented/);
});
