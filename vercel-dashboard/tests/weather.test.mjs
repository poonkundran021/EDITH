import test from 'node:test';
import assert from 'node:assert/strict';
import {indiaDate,addDays,validDate,parseDay,placeQuery,inTamilNadu,weatherAnswer,askWeather} from '../lib/weather.ts';

const now=new Date('2026-10-11T20:00:00Z');
const place={id:1255062,name:'Tambaram',latitude:12.9246,longitude:80.12707,admin1:'Tamil Nadu',country_code:'IN'};
test('calendar uses IST, including month/year boundaries',()=>{
 assert.equal(indiaDate(now),'2026-10-12');assert.equal(addDays('2026-12-31',1),'2027-01-01');
 assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2028-02-29'),true);
});
test('understands the event question and English relative dates',()=>{
 assert.equal(parseDay('going to Tambaram Chennai on 31st of October',now).date,'2026-10-31');
 assert.equal(parseDay('How about tomorrow?',now).date,'2026-10-13');
 assert.equal(parseDay('on 31/10/2026',now).date,'2026-10-31');
 assert.equal(parseDay('current weather',now).date,'2026-10-12');
});
test('understands Tamil dates and rejects impossible dates',()=>{
 assert.equal(parseDay('நாளை தாம்பரத்தில் வானிலை எப்படி?',now).date,'2026-10-13');
 assert.equal(parseDay('அக்டோபர் 31 அன்று சென்னையில் நிகழ்ச்சி',now).date,'2026-10-31');
 assert.equal(parseDay('நாளை மறுநாள் வானிலை?',now).date,'2026-10-14');
 assert.equal(parseDay('on 2026-02-30',now).error,true);
 assert.equal(parseDay('31 February',now).error,true);
});
test('prefers Tambaram within Chennai and enforces Tamil Nadu',()=>{
 assert.equal(placeQuery('going to Tambaram Chennai on 31st of October'),'Tambaram');
 assert.equal(placeQuery('நாளை தாம்பரத்தில் எப்படி?'),'Tambaram');
 assert.equal(placeQuery('weather in Mumbai'),'__outside__');
 assert.equal(placeQuery('What about rain for tomorrow?'),null);
 assert.equal(inTamilNadu(place),true);assert.equal(inTamilNadu({...place,admin1:'Kerala'}),false);
});
test('out-of-range dates do not request or invent forecasts',async()=>{
 const r=await weatherAnswer(place,'2026-10-31','en',now);
 assert.equal(r.kind,'unavailable');assert.match(r.text,/16 October 2026/);assert.doesNotMatch(r.text,/°C|\d+%/);
 const past=await weatherAnswer(place,'2026-10-01','ta',now);assert.equal(past.kind,'unavailable');
});
test('missing places and outside-state requests ask for clarification',async()=>{
 assert.equal((await askWeather('How is the weather?','en')).kind,'clarify');
 assert.equal((await askWeather('weather in Mumbai','en',{place})).kind,'clarify');
});
test('live provider data creates grounded bilingual event advice, with null values preserved',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({daily:{time:['2026-10-13'],temperature_2m_max:[32],temperature_2m_min:[25],precipitation_probability_max:[80],precipitation_sum:[12],wind_speed_10m_max:[null],weather_code:[95]}});};
 try{
  const en=await weatherAnswer(place,'2026-10-13','en',now);const ta=await weatherAnswer(place,'2026-10-13','ta',now);
  assert.match(en.text,/80%/);assert.match(en.text,/indoor alternative/);assert.match(en.text,/— km\/h/);assert.match(ta.text,/இடியுடன் மழை/);assert.equal(calls,1);
  assert.match(en.source,/api.open-meteo.com/);assert.equal(en.kind,'answer');
 }finally{globalThis.fetch=original;}
});
