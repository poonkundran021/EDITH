import {z} from 'zod';
import type {Place,Language} from './weather';

const value=z.number().finite().nullable();
const archiveSchema=z.object({daily:z.object({time:z.array(z.string()),temperature_2m_max:z.array(value),temperature_2m_min:z.array(value),precipitation_sum:z.array(value)})});
export type HistoricalDay={date:string;high:number|null;low:number|null;rain:number|null};
export type YearSummary={year:number;days:number;high:number|null;low:number|null;rainDays:number;rainSamples:number};
export type HistorySummary={firstYear:number;lastYear:number;datasetDays:number;sampleDays:number;high:number|null;low:number|null;highMin:number|null;highMax:number|null;rainDays:number;rainSamples:number;years:YearSummary[];source:string};
const archiveCache=new Map<string,{expires:number;days:HistoricalDay[]}>();
const mean=(values:(number|null)[])=>{const v=values.filter((x):x is number=>x!==null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
const iso=(year:number,monthDay:string)=>`${year}-${monthDay==='02-29' && !(year%4===0&&(year%100!==0||year%400===0))?'02-28':monthDay}`;

// Compare the same season (+/-7 calendar days), wrapping across New Year.
export function seasonalDistance(date:string,target:string){
 const year=Number(date.slice(0,4));
 const anchor=iso(year,target.slice(5));
 const delta=Math.abs((Date.parse(date+'T12:00:00Z')-Date.parse(anchor+'T12:00:00Z'))/86400000);
 const yearDays=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
 return Math.min(delta,yearDays-delta);
}
export function summarizeHistory(days:HistoricalDay[],target:string,firstYear:number,lastYear:number,source:string):HistorySummary{
 const usable=days.filter(d=>Number(d.date.slice(0,4))>=firstYear&&Number(d.date.slice(0,4))<=lastYear);
 const sample=usable.filter(d=>seasonalDistance(d.date,target)<=7);
 const summarize=(rows:HistoricalDay[],year:number):YearSummary=>({year,days:rows.length,high:mean(rows.map(d=>d.high)),low:mean(rows.map(d=>d.low)),rainDays:rows.filter(d=>d.rain!==null&&d.rain>=1).length,rainSamples:rows.filter(d=>d.rain!==null).length});
 const years=Array.from({length:5},(_,i)=>summarize(sample.filter(d=>Number(d.date.slice(0,4))===firstYear+i),firstYear+i));
 // Do not claim a five-year comparison if any requested year has no usable data.
 if(years.some(y=>y.days<10||y.high===null||y.low===null||!y.rainSamples))throw new Error('Incomplete five-year seasonal coverage');
 const all=summarize(sample,0),highs=sample.flatMap(d=>d.high===null?[]:[d.high]);
 return {firstYear,lastYear,datasetDays:usable.length,sampleDays:sample.length,high:all.high,low:all.low,highMin:highs.length?Math.min(...highs):null,highMax:highs.length?Math.max(...highs):null,rainDays:all.rainDays,rainSamples:all.rainSamples,years,source};
}
export async function getWeatherHistory(place:Place,target:string,now=new Date(),fetcher:typeof fetch=fetch):Promise<HistorySummary>{
 if(place.country_code!=='IN'||place.admin1.toLowerCase().replace(/\s/g,'')!=='tamilnadu')throw new Error('Tamil Nadu only');
 const currentYear=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Kolkata',year:'numeric'}).format(now));
 // For past dates, avoid using years after the date being assessed.
 const lastYear=Math.min(currentYear,Number(target.slice(0,4)))-1,firstYear=lastYear-4;
 if(firstYear<1940)throw new Error('Historical coverage unavailable');
 const url=new URL('https://archive-api.open-meteo.com/v1/archive');
 url.search=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),start_date:`${firstYear}-01-01`,end_date:`${lastYear}-12-31`,daily:'temperature_2m_max,temperature_2m_min,precipitation_sum',models:'era5',timezone:'Asia/Kolkata'}).toString();
 const cached=archiveCache.get(url.href);
 let days=cached&&cached.expires>Date.now()?cached.days:undefined;
 if(!days){
  const response=await fetcher(url.href,{signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('Historical service unavailable');
  const {daily}=archiveSchema.parse(await response.json());
  if([daily.temperature_2m_max,daily.temperature_2m_min,daily.precipitation_sum].some(v=>v.length!==daily.time.length))throw new Error('Incomplete archive');
  const seen=new Set<string>();
  days=daily.time.map((date,i)=>{
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||seen.has(date))throw new Error('Invalid archive date');
   seen.add(date);return {date,high:daily.temperature_2m_max[i],low:daily.temperature_2m_min[i],rain:daily.precipitation_sum[i]};
  });
  if(archiveCache.size>=8)archiveCache.delete(archiveCache.keys().next().value!);
  archiveCache.set(url.href,{expires:Date.now()+86400000,days});
 }
 return summarizeHistory(days,target,firstYear,lastYear,url.href);
}
const n=(v:number|null)=>v===null?'—':v.toFixed(1);
export function historyText(h:HistorySummary,language:Language){
 const frequency=h.rainSamples?Math.round(h.rainDays/h.rainSamples*100):null;
 if(language==='ta')return `ஐந்தாண்டு பருவகால மதிப்பீடு (${h.firstYear}–${h.lastYear})\nERA5 வரலாற்று தரவின் ${h.datasetDays} நாட்களில், தேர்ந்தெடுத்த தேதியைச் சுற்றியுள்ள ±7 நாட்களை ஒப்பிட்டேன் (${h.sampleDays} நாட்கள்). சராசரி தினசரி குறைந்த/அதிக வெப்பநிலை ${n(h.low)}–${n(h.high)}°C. கடந்த அதிகபட்ச வெப்பநிலைகளின் வரம்பு ${n(h.highMin)}–${n(h.highMax)}°C. குறைந்தது 1 மி.மீ. மழை ${h.rainDays}/${h.rainSamples} நாட்களில் (${frequency}%) இருந்தது.\nஇது கடந்த கால மழை நிகழ்வு விகிதம்; உங்கள் நிகழ்ச்சி நாளின் மழை வாய்ப்பு அல்ல. ஐந்தாண்டு மாதிரி சிறியது; துல்லியமான தினசரி முன்னறிவிப்பு அல்ல. EDITH-இன் இன்றைய அளவுகள் எதிர்கால வானிலையை உறுதி செய்யாது. ${frequency!==null&&frequency>=30?'கூரையுள்ள மாற்று இடத்தைத் திட்டமிடுவது நல்லது.':'வெளிப்புற நிகழ்ச்சிக்கு மாற்று ஏற்பாட்டை வைத்திருங்கள்.'}`;
 return `Five-year seasonal estimate (${h.firstYear}–${h.lastYear})\nI fetched ${h.datasetDays} days of ERA5 historical weather and compared the same season, ±7 days around your date (${h.sampleDays} days). Average daily low/high: ${n(h.low)}–${n(h.high)}°C. Historical daily highs ranged from ${n(h.highMin)} to ${n(h.highMax)}°C. At least 1 mm of rain occurred on ${h.rainDays}/${h.rainSamples} days (${frequency}%).\nThat percentage is a historical frequency, NOT your event's rain probability. Five years is a small sample, not an exact daily forecast. Today's EDITH readings cannot establish future weather. ${frequency!==null&&frequency>=30?'A covered backup venue is sensible for this season.':'Keep a backup plan for an outdoor event.'}`;
}
