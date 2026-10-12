import {z} from 'zod';
import {getWeatherHistory,historyText} from './weather-history.ts';
import {telemetrySchema,STALE_MS} from './telemetry.ts';
import type {Language,Place,WeatherReply} from './weather';

// Physical station location confirmed by the owner; city-centre coordinates from GeoNames.
export const EDITH_STATION:Place={id:1254361,name:'Tirunelveli',latitude:8.72742,longitude:77.6838,admin1:'Tamil Nadu',admin2:'Tirunelveli',country_code:'IN'};

const optionalValue=z.number().finite().nullable();
const currentSchema=z.object({current:z.object({time:z.string(),temperature_2m:optionalValue,relative_humidity_2m:optionalValue,surface_pressure:optionalValue})});
const snapshotSchema=z.object({data:telemetrySchema.nullable(),ageMs:z.number().nonnegative().nullable(),online:z.boolean()});
export function sameLocalArea(a:Place,b:Place){
 const rad=Math.PI/180,dLat=(a.latitude-b.latitude)*rad,dLon=(a.longitude-b.longitude)*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2;
 return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)))<=10;
}
export async function sensorComparison(place:Place,station:Place|undefined,language:Language,fetcher:typeof fetch=fetch){
 const ta=language==='ta';
 if(!station)return ta?'EDITH ஒப்பீடு: கருவி இருக்கும் இடம் உறுதி செய்யப்படவில்லை.':'EDITH comparison: the physical station location has not been confirmed.';
 if(!sameLocalArea(place,station))return ta?`EDITH ${station.name}-இல் உள்ளது. ${place.name}-க்கான உள்ளூர் அளவாக இதைப் பயன்படுத்தவில்லை.`:`EDITH is set to ${station.name}, more than 10 km from ${place.name}; its readings are not used as local evidence for this destination.`;
 try{
  const response=await fetcher('/api/telemetry',{cache:'no-store',signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw Error();
  const snapshot=snapshotSchema.parse(await response.json());
  if(!snapshot.data||!snapshot.online||snapshot.ageMs===null||snapshot.ageMs>=STALE_MS)return ta?'EDITH ஒப்பீடு: புதிய சென்சார் தரவு இல்லை. பழைய தரவை ஒப்பீட்டில் பயன்படுத்தவில்லை.':'EDITH comparison: no fresh sensor packet is available. Stale readings were excluded.';
  const sensor=snapshot.data;
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:String(station.latitude),longitude:String(station.longitude),current:'temperature_2m,relative_humidity_2m,surface_pressure',timezone:'Asia/Kolkata'}).toString();
  const modelResponse=await fetcher(url.href,{signal:AbortSignal.timeout(12000)});
  if(!modelResponse.ok)throw Error();
  const {current}=currentSchema.parse(await modelResponse.json());
  const time=new Date(sensor.capturedAt).toLocaleTimeString(ta?'ta-IN':'en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const n=(x:number|null)=>x===null?'—':x.toFixed(1);
  const delta=(x:number|null,y:number|null)=>x===null||y===null?'—':`${x-y>=0?'+':''}${(x-y).toFixed(1)}`;
  return ta?`EDITH உள்ளூர் ஒப்பீடு · ${station.name}\nசென்சார் பதிவு ${time} IST: BMP280 ${n(sensor.temperature)}°C; DHT11 ${n(sensor.humidity)}%; அழுத்தம் ${n(sensor.pressure)} hPa. இணைய மாதிரி (${current.time} IST): ${n(current.temperature_2m)}°C, ${n(current.relative_humidity_2m)}%, ${n(current.surface_pressure)} hPa. வேறுபாடு: ${delta(sensor.temperature,current.temperature_2m)}°C, ${delta(sensor.humidity,current.relative_humidity_2m)} ஈரப்பத சதவீதப் புள்ளிகள். இவை தற்போதைய உள்ளூர் சூழல் மட்டும்; வீட்டினுள்/வெளியில் இருப்பதும் சென்சார் பொருத்தமும் வேறுபாட்டை ஏற்படுத்தலாம். எதிர்கால முன்னறிவிப்பை இதனால் மாற்றவில்லை.`:`EDITH local comparison · ${station.name}\nSensor sample at ${time} IST: BMP280 ${n(sensor.temperature)}°C; DHT11 ${n(sensor.humidity)}%; pressure ${n(sensor.pressure)} hPa. Internet model (${current.time} IST): ${n(current.temperature_2m)}°C, ${n(current.relative_humidity_2m)}%, ${n(current.surface_pressure)} hPa. Sensor minus model: ${delta(sensor.temperature,current.temperature_2m)}°C and ${delta(sensor.humidity,current.relative_humidity_2m)} humidity percentage points. This is current local context; indoor placement and sensor exposure can explain differences. It does not adjust the future forecast.`;
 }catch{return ta?'EDITH ஒப்பீட்டை தற்போது பெற முடியவில்லை. வரலாற்று தரவும் இணைய முன்னறிவிப்பும் தனித்தனியாக வழங்கப்பட்டுள்ளன.':'EDITH comparison is unavailable right now. Historical estimates and internet forecasts remain separate.';}
}
export async function addWeatherInsights(reply:WeatherReply,language:Language,station?:Place,now=new Date(),fetcher:typeof fetch=fetch):Promise<WeatherReply>{
 if(!reply.place||!reply.date||reply.kind==='clarify')return reply;
 const [history,sensor]=await Promise.allSettled([getWeatherHistory(reply.place,reply.date,now,fetcher),sensorComparison(reply.place,station,language,fetcher)]);
 const historyNote=history.status==='fulfilled'?historyText(history.value,language):language==='ta'?'ஐந்தாண்டு வரலாற்று தரவு முழுமையாகக் கிடைக்கவில்லை. மதிப்பீட்டை உருவாக்கவில்லை; மீண்டும் முயற்சிக்கவும்.':'The complete five-year history could not be loaded. No seasonal estimate was invented; please retry.';
 return {...reply,history:history.status==='fulfilled'?history.value:undefined,text:[reply.text,historyNote,sensor.status==='fulfilled'?sensor.value:''].filter(Boolean).join('\n\n'),fetchedAt:new Date().toISOString()};
}
