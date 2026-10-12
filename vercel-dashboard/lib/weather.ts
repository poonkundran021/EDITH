import * as chrono from 'chrono-node';
import { z } from 'zod';
import type {HistorySummary} from './weather-history';

export type Language = 'en' | 'ta';
export type Place = { id: number; name: string; latitude: number; longitude: number; admin1: string; country_code: string; admin2?: string };
export type WeatherReply = { text: string; place?: Place; date?: string; choices?: Place[]; source?: string; fetchedAt?: string; history?:HistorySummary; kind: 'answer' | 'clarify' | 'unavailable' };
const placeSchema = z.object({id:z.number().int(),name:z.string(),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),admin1:z.string(),country_code:z.string(),admin2:z.string().optional()});
const cache = new Map<string,{until:number;data:unknown}>();
export function indiaDate(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function addDays(date: string, days: number) { return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10); }
export function validDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date+'T12:00:00Z')) && new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date; }
export function inTamilNadu(p: Place) { return p.country_code==='IN' && p.admin1.toLowerCase().replace(/\s/g,'')==='tamilnadu'; }
function dateLabel(date:string, lang:Language) { return new Intl.DateTimeFormat(lang==='ta'?'ta-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(date+'T12:00:00Z')); }

const aliases: [string,string][] = [
 ['tambaram|தாம்பரம்|தாம்பரத்தில்','Tambaram'],['velachery|வேளச்சேரி','Velachery'],['chromepet|குரோம்பேட்டை','Chromepet'],['pallavaram|பல்லாவரம்','Pallavaram'],['avadi|ஆவடி','Avadi'],['ambattur|அம்பத்தூர்','Ambattur'],['sholinganallur|சோழிங்கநல்லூர்','Sholinganallur'],
 ['chennai|madras|சென்னை','Chennai'],['coimbatore|kovai|கோயம்புத்தூர்|கோவை','Coimbatore'],['madurai|மதுரை','Madurai'],['tiruchirappalli|trichy|tiruchi|திருச்சி','Tiruchirappalli'],['salem|சேலம்','Salem'],['tirunelveli|nellai|திருநெல்வேலி|நெல்லை','Tirunelveli'],['thoothukudi|tuticorin|தூத்துக்குடி','Thoothukudi'],['tiruppur|tirupur|திருப்பூர்','Tiruppur'],['erode|ஈரோடு','Erode'],['vellore|வேலூர்','Vellore'],['thanjavur|tanjore|தஞ்சாவூர்','Thanjavur'],['dindigul|திண்டுக்கல்','Dindigul'],['nagercoil|நாகர்கோவில்','Nagercoil'],['kanyakumari|கன்னியாகுமரி','Kanyakumari'],['kanchipuram|காஞ்சிபுரம்','Kanchipuram'],['chengalpattu|செங்கல்பட்டு','Chengalpattu'],['tiruvallur|திருவள்ளூர்','Tiruvallur'],['cuddalore|கடலூர்','Cuddalore'],['villupuram|விழுப்புரம்','Villupuram'],['kallakurichi|கள்ளக்குறிச்சி','Kallakurichi'],['tiruvannamalai|திருவண்ணாமலை','Tiruvannamalai'],['krishnagiri|கிருஷ்ணகிரி','Krishnagiri'],['dharmapuri|தர்மபுரி','Dharmapuri'],['namakkal|நாமக்கல்','Namakkal'],['karur|கரூர்','Karur'],['perambalur|பெரம்பலூர்','Perambalur'],['ariyalur|அரியலூர்','Ariyalur'],['pudukkottai|புதுக்கோட்டை','Pudukkottai'],['sivaganga|சிவகங்கை','Sivaganga'],['ramanathapuram|ராமநாதபுரம்','Ramanathapuram'],['virudhunagar|விருதுநகர்','Virudhunagar'],['theni|தேனி','Theni'],['tenkasi|தென்காசி','Tenkasi'],['tirupattur|திருப்பத்தூர்','Tirupattur'],['ranipet|ராணிப்பேட்டை','Ranipet'],['nagapattinam|நாகப்பட்டினம்','Nagapattinam'],['mayiladuthurai|மயிலாடுதுறை','Mayiladuthurai'],['tiruvarur|திருவாரூர்','Tiruvarur'],['ooty|udhagamandalam|உதகமண்டலம்|ஊட்டி','Udhagamandalam'],['kodaikanal|கொடைக்கானல்','Kodaikanal'],['rameswaram|ராமேஸ்வரம்','Rameswaram'],['pollachi|பொள்ளாச்சி','Pollachi'],['hosur|ஓசூர்','Hosur'],['kumbakonam|கும்பகோணம்','Kumbakonam'],['mahabalipuram|mamallapuram|மாமல்லபுரம்','Mamallapuram'],['yercaud|ஏற்காடு','Yercaud'],['chidambaram|சிதம்பரம்','Chidambaram'],['sivakasi|சிவகாசி','Sivakasi']
];

export function placeQuery(message:string) {
  if (/\b(mumbai|delhi|bengaluru|bangalore|hyderabad|kochi|kerala|puducherry|pondicherry)\b|மும்பை|டெல்லி|பெங்களூர்|புதுச்சேரி/i.test(message)) return '__outside__';
  for (const [pattern,name] of aliases) if (new RegExp(pattern.split('|').map(s=>/^[a-z]+$/i.test(s)?`\\b${s}\\b`:s).join('|'),'i').test(message)) return name;
  // Unknown towns can be resolved by GeoNames; ambiguous results are never silently selected.
  const match=message.match(/\b(?:in|at|to|for)\s+([a-z][a-z .'-]{1,65}?)(?=\s+(?:on|today|tomorrow|next|this|weather|forecast|for|at|in|will|would|during)\b|[?,!]|$)/i);
  const candidate=match?.[1]?.trim();
  if(!candidate || /^(?:a|an|the|my|our|your|tomorrow|today|yesterday|next|this|wedding|event|rain|weather|wind|temperature|humidity|picnic|party|travel)\b/i.test(candidate))return null;
  return candidate;
}

export function parseDay(message:string, now=new Date()): {date?:string;error?:boolean} {
  let text=message.replace(/[௦-௯]/g,c=>String(c.charCodeAt(0)-0x0be6));
  const tamilMonths=['ஜனவரி','பிப்ரவரி','மார்ச்','ஏப்ரல்','மே','ஜூன்','ஜூலை','ஆகஸ்ட்','செப்டம்பர்','அக்டோபர்','நவம்பர்','டிசம்பர்'];
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  tamilMonths.forEach((m,i)=>{text=text.replaceAll(m,months[i]);});
  text=text.replace(/நாளை மறுநாள்/g,'in 2 days').replace(/நாளைக்கு|நாளை/g,'tomorrow').replace(/இன்றைக்கு|இன்று|இப்போது/g,'today').replace(/நேற்று/g,'yesterday').replace(/(\d+)\s*(?:ஆம்|ம்)\s*தேதி/g,'$1').replace(/(\d+)(?:ஆம்|ம்)/g,'$1');
  ['ஞாயிறு','திங்கள்','செவ்வாய்','புதன்','வியாழன்','வெள்ளி','சனி'].forEach((day,i)=>{text=text.replaceAll(day,['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i]);});
  text=text.replace(/அடுத்த\s*/g,'next ');
  // GB parsing treats "October 31" as month/year; normalize month-first dates.
  text=text.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,'$2 $1');
  if(/\bcurrent\b|தற்போது/.test(text))return {date:indiaDate(now)};
  const numeric=text.match(/\b(\d{4}-\d{1,2}-\d{1,2})\b|\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if(numeric){const d=numeric[1]?numeric[1].split('-').map((x,i)=>i?x.padStart(2,'0'):x).join('-'):`${numeric[4]}-${numeric[3].padStart(2,'0')}-${numeric[2].padStart(2,'0')}`;return validDate(d)?{date:d}:{error:true};}
  const parsed=chrono.en.GB.parse(text,{instant:now,timezone:330},{forwardDate:true});
  if(parsed.length>1 || parsed[0]?.end)return {error:true};
  if(parsed.length){const p=parsed[0].start;const d=`${p.get('year')}-${String(p.get('month')).padStart(2,'0')}-${String(p.get('day')).padStart(2,'0')}`;return validDate(d)?{date:d}:{error:true};}
  if(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b.*\d|\d.*\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d\s*[/.]\s*\d/i.test(text)) return {error:true};
  return {};
}

async function getJSON(url:string, ttl:number, fetcher:typeof fetch=fetch) {
  const existing=cache.get(url);if(existing && existing.until>Date.now()) return existing.data;
  const response=await fetcher(url,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Weather provider unavailable');
  const data:unknown=await response.json();
  if(cache.size>=60)cache.delete(cache.keys().next().value!);
  cache.set(url,{until:Date.now()+ttl,data});return data;
}
export async function searchPlaces(query:string):Promise<Place[]> {
  if(query.trim().length<2)return [];
  const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search=new URLSearchParams({name:query.trim(),count:'30',language:'en',countryCode:'IN',format:'json'}).toString();
  const result=z.object({results:z.array(placeSchema).optional()}).parse(await getJSON(url.href,86400000));
  return (result.results??[]).filter(inTamilNadu).slice(0,6);
}
const nullable=z.number().finite().nullable();
const forecastSchema=z.object({
  current:z.object({time:z.string(),temperature_2m:nullable,relative_humidity_2m:nullable,weather_code:nullable,wind_speed_10m:nullable}).optional(),
  daily:z.object({time:z.array(z.string()),temperature_2m_max:z.array(nullable),temperature_2m_min:z.array(nullable),precipitation_probability_max:z.array(nullable),precipitation_sum:z.array(nullable),wind_speed_10m_max:z.array(nullable),weather_code:z.array(nullable)})
});
export function weatherDescription(code:number|null,lang:Language) {
  const pair=code===null?['conditions unavailable','வானிலை விவரம் கிடைக்கவில்லை']:code===0?['clear skies','தெளிவான வானம்']:code<=3?['partly cloudy to overcast','பகுதி மேகமூட்டம் முதல் முழு மேகமூட்டம் வரை']:code<=48?['fog','மூடுபனி']:code<=57?['drizzle','தூறல்']:code<=67?['rain','மழை']:code<=77?['snow','பனிப்பொழிவு']:code<=82?['rain showers','இடைவிட்டு மழை']:code<=86?['snow showers','பனிப்பொழிவு']:['thunderstorms','இடியுடன் மழை'];
  return pair[lang==='ta'?1:0];
}
const n=(v:number|null|undefined)=>v==null?'—':String(Math.round(v*10)/10);
export async function weatherAnswer(place:Place,date:string,lang:Language,now=new Date()):Promise<WeatherReply> {
  if(!inTamilNadu(place))throw new Error('Tamil Nadu only');
  const today=indiaDate(now),last=addDays(today,15),title=`${place.name}, ${place.admin2?place.admin2+', ':''}Tamil Nadu`;
  if(!validDate(date))return {kind:'clarify',place,text:lang==='ta'?'சரியான தேதியைத் தேர்ந்தெடுக்கவும்.':'Please choose a valid calendar date.'};
  if(date<today)return {kind:'unavailable',place,date,text:lang==='ta'?`${dateLabel(date,lang)} கடந்த தேதி. இந்த உதவியாளர் இன்று மற்றும் அடுத்த 15 நாட்களின் முன்னறிவிப்புகளை வழங்குகிறது. எதிர்கால தேதியைத் தேர்ந்தெடுக்கவும்.`:`${dateLabel(date,lang)} is in the past. This assistant provides current conditions and forecasts through ${dateLabel(last,lang)}. Please choose today or a future date.`};
  if(date>last)return {kind:'unavailable',place,date,text:lang==='ta'?`${title} — ${dateLabel(date,lang)}: அந்த நாளுக்கான தினசரி முன்னறிவிப்பு இன்னும் கிடைக்கவில்லை. இப்போது ${dateLabel(last,lang)} வரை மட்டுமே கிடைக்கும். ${dateLabel(addDays(date,-15),lang)} முதல் மீண்டும் கேளுங்கள்; கிடைக்கும் என உறுதி அளிக்க முடியாது. நிகழ்ச்சிக்கு 2–3 நாட்களுக்கு முன் மீண்டும் சரிபார்க்கவும். இப்போது மழை அல்லது வெப்பநிலையை ஊகித்துச் சொல்ல மாட்டேன்.`:`${title} — ${dateLabel(date,lang)}: a daily forecast is not available that far ahead. The current window ends on ${dateLabel(last,lang)}. Try again from ${dateLabel(addDays(date,-15),lang)}, when that date may enter the forecast window, and recheck 2–3 days before your event. I cannot give a reliable temperature or rain prediction for it yet.`,source:'https://open-meteo.com/en/docs'};
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),timezone:'Asia/Kolkata',start_date:date,end_date:date,daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,weather_code',...(date===today?{current:'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m'}:{})}).toString();
  const forecast=forecastSchema.parse(await getJSON(url.href,600000));
  const i=forecast.daily.time.indexOf(date);
  if(i<0)throw new Error('Requested date unavailable');
  const daily=forecast.daily,rain=daily.precipitation_probability_max[i],wind=daily.wind_speed_10m_max[i],high=daily.temperature_2m_max[i],low=daily.temperature_2m_min[i],code=daily.weather_code[i]??null;
  const severe=code!==null&&code>=95,wet=(rain??0)>=50,hot=(high??0)>=35,breezy=(wind??0)>=35;
  let advice=lang==='ta'?'முன்னறிவிப்பு மாறலாம். நிகழ்ச்சிக்கு 2–3 நாட்களுக்கு முன் மீண்டும் சரிபார்க்கவும்.':'Forecasts can change. Recheck 2–3 days before the event.';
  if(severe)advice=(lang==='ta'?'இடியுடன் மழை வாய்ப்பு உள்ளது; நிகழ்ச்சிக்கு உள்புற மாற்று ஏற்பாடு செய்யுங்கள். அதிகாரப்பூர்வ எச்சரிக்கைகளைப் பாருங்கள். ':'Thunderstorms are forecast; arrange an indoor alternative and check official warnings. ')+advice;
  else if(wet)advice=(lang==='ta'?'மழை வாய்ப்பு அதிகம்; குடை மற்றும் கூரையுள்ள மாற்று இடத்தைத் திட்டமிடுங்கள். ':'Rain is possible; plan a covered alternative and bring an umbrella. ')+advice;
  else if(rain!==null)advice=(lang==='ta'?'வெளிப்புற நிகழ்ச்சிக்கான மாற்று ஏற்பாட்டை வைத்திருங்கள்; குறைந்த வாய்ப்பு என்றாலும் மழை வராது என உறுதி இல்லை. ':'Keep a backup for an outdoor event; a lower rain chance does not guarantee dry weather. ')+advice;
  if(hot)advice+=(lang==='ta'?' வெப்பம் அதிகமாக இருக்கலாம்; தண்ணீர் மற்றும் நிழலுக்கு ஏற்பாடு செய்யுங்கள்.':' It may be hot; plan water and shade.');
  if(breezy)advice+=(lang==='ta'?' காற்று அதிகமாக இருக்கலாம்; தற்காலிக அலங்காரங்களைப் பாதுகாப்பாக அமைக்கவும்.':' Wind may affect temporary outdoor decorations.');
  const current=forecast.current;
  const currentText=current?(lang==='ta'?`தற்போதைய வானிலை மாதிரி (${current.time.replace('T',' ')} IST): ${n(current.temperature_2m)}°C, ${weatherDescription(current.weather_code,lang)}, ஈரப்பதம் ${n(current.relative_humidity_2m)}%, காற்று ${n(current.wind_speed_10m)} கி.மீ/மணி.\n\n`:`Current model estimate (${current.time.replace('T',' ')} IST): ${n(current.temperature_2m)}°C, ${weatherDescription(current.weather_code,lang)}, humidity ${n(current.relative_humidity_2m)}%, wind ${n(current.wind_speed_10m)} km/h.\n\n`):'';
  const detail=lang==='ta'?`நாள் முன்னறிவிப்பு: ${weatherDescription(code,lang)}. வெப்பநிலை ${n(low)}–${n(high)}°C. அதிகபட்ச மழை வாய்ப்பு ${n(rain)}%; மொத்த மழை ${n(daily.precipitation_sum[i])} மி.மீ. அதிகபட்ச காற்று ${n(wind)} கி.மீ/மணி.`:`Daily outlook: ${weatherDescription(code,lang)}. Temperature ${n(low)}–${n(high)}°C. Maximum rain probability ${n(rain)}%; total precipitation ${n(daily.precipitation_sum[i])} mm. Maximum wind ${n(wind)} km/h.`;
  return {kind:'answer',place,date,text:`${title} · ${dateLabel(date,lang)}\n\n${currentText}${detail}\n\n${advice}`,source:url.href,fetchedAt:new Date().toISOString()};
}

export async function askWeather(message:string,lang:Language,context?:{place?:Place;date?:string},override?:{place?:Place;date?:string}):Promise<WeatherReply> {
  const query=placeQuery(message),parsed=parseDay(message),ta=lang==='ta';
  if(query==='__outside__')return {kind:'clarify',text:ta?'இந்த உதவியாளர் தமிழ்நாட்டில் உள்ள இடங்களுக்கு மட்டும் வானிலை வழங்குகிறது. தமிழ்நாட்டு நகரம் அல்லது ஊரைத் தேர்ந்தெடுக்கவும்.':'I cover Tamil Nadu locations only. Please choose a town or city within Tamil Nadu.'};
  if(parsed.error)return {kind:'clarify',text:ta?'தேதியைப் புரிந்துகொள்ள முடியவில்லை. கீழே உள்ள தேதி தேர்வைப் பயன்படுத்தவும்.':'I could not resolve that date. Please use the date picker below (numeric dates use day/month/year).'};
  let place=override?.place;
  if(!place && query){const places=await searchPlaces(query);if(places.length===1)place=places[0];else return {kind:'clarify',choices:places,date:parsed.date??context?.date,text:places.length?(ta?'ஒன்றுக்கும் மேற்பட்ட இடங்கள் உள்ளன. நீங்கள் செல்லும் இடத்தைத் தேர்ந்தெடுக்கவும்.':'I found several matches. Choose the place you mean.'):(ta?'அந்த இடத்தை தமிழ்நாட்டில் கண்டறிய முடியவில்லை. கீழே உள்ள இடத் தேடலைப் பயன்படுத்தவும்.':'I could not match that place within Tamil Nadu. Use the location search below.')};}
  place??=context?.place;
  if(!place)return {kind:'clarify',text:ta?'தமிழ்நாட்டில் எந்த இடத்திற்கு வானிலை வேண்டும்? உதாரணம்: “நாளை தாம்பரத்தில் வானிலை எப்படி இருக்கும்?”':'Which Tamil Nadu location do you mean? For example: “How is the weather in Tambaram tomorrow?”'};
  const date=override?.date??parsed.date??context?.date??indiaDate();
  try{return await weatherAnswer(place,date,lang);}
  catch{return {kind:'unavailable',place,date,text:ta?'இணைய தினசரி முன்னறிவிப்பு தற்போது கிடைக்கவில்லை. கீழே கிடைக்கும் வரலாற்று ஒப்பீடு உண்மையான தினசரி முன்னறிவிப்புக்கு மாற்றாகாது.':'The daily internet forecast is unavailable right now. Any historical comparison below is seasonal context, not a replacement daily forecast.'};}
}
