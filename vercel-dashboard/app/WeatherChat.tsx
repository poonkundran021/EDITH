'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, CloudSun, MapPin, Mic, Square, Send, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { askWeather, indiaDate, searchPlaces, type Language, type Place, type WeatherReply } from '../lib/weather';
import { useDictation } from './useDictation';

import { prepareLocalSpeech, speakLocally, stopLocalSpeech } from '../lib/local-speech';
type Message = {id:number;role:'user'|'assistant';text:string;lang:Language;reply?:WeatherReply};
export default function WeatherChat(){
 const [lang,setLang]=useState<Language>('en'),[message,setMessage]=useState(''),[messages,setMessages]=useState<Message[]>([]),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[places,setPlaces]=useState<Place[]>([]),[place,setPlace]=useState<Place>(),[date,setDate]=useState(''),[searching,setSearching]=useState(false),[searchNote,setSearchNote]=useState(''),[autoSpeak,setAutoSpeak]=useState(true),[voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[speaking,setSpeaking]=useState(false),[voiceNote,setVoiceNote]=useState('');
 const context=useRef<{place?:Place;date?:string}>({}),seq=useRef(0),bottom=useRef<HTMLDivElement>(null),utterance=useRef<SpeechSynthesisUtterance|null>(null),alive=useRef(true);
 const ta=lang==='ta';
 const dictation=useDictation(lang,message,setMessage);
 const voice=voices.find(v=>v.lang.toLowerCase()===(ta?'ta-in':'en-in'))??voices.find(v=>v.lang.toLowerCase().startsWith(lang));
 useEffect(()=>{alive.current=true;const synth=window.speechSynthesis;const update=()=>setVoices(synth?.getVoices()??[]);update();synth?.addEventListener('voiceschanged',update);return()=>{alive.current=false;synth?.removeEventListener('voiceschanged',update);synth?.cancel();stopLocalSpeech();};},[]);
 useEffect(()=>{const log=bottom.current?.parentElement;if(messages.length&&log)log.scrollTo({top:log.scrollHeight,behavior:'smooth'});},[messages,busy]);
 useEffect(()=>{
   let active=true;setPlaces([]);setSearchNote('');
   if(query.trim().length<3){setSearching(false);return;}
   setSearching(true);const timer=setTimeout(async()=>{try{const p=await searchPlaces(query);if(active){setPlaces(p);if(!p.length)setSearchNote(ta?'தமிழ்நாட்டு இடம் கிடைக்கவில்லை. வேறு பெயரில் தேடவும்.':'No Tamil Nadu match. Try another spelling or a nearby town.');}}catch{if(active)setSearchNote(ta?'இடத் தேடல் தற்போது கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.':'Location search is unavailable. Please retry.');}finally{if(active)setSearching(false);}},550);
   return()=>{active=false;clearTimeout(timer);};
 },[query,ta]);
 function stop(){stopLocalSpeech();if('speechSynthesis' in window)window.speechSynthesis.cancel();setSpeaking(false);utterance.current=null;}
 function speak(text:string,language:Language){
   dictation.cancel();stop();setVoiceNote('');
   const selected=voices.find(v=>v.lang.toLowerCase()===(language==='ta'?'ta-in':'en-in'))??voices.find(v=>v.lang.toLowerCase().startsWith(language));
   if(!('speechSynthesis' in window)||!selected){
     setVoiceNote(language==='ta'?'இலவச உள்ளூர் தமிழ் குரலைத் தயாரிக்கிறேன்…':'Preparing the free local voice…');
     speakLocally(text,language,()=>{if(alive.current){setSpeaking(true);setVoiceNote(language==='ta'?'உள்ளூர் தமிழ் குரல் · செயற்கையான ஒலி':'Local voice · synthetic speech');}},()=>{if(alive.current)setSpeaking(false);},()=>{if(alive.current){setSpeaking(false);setVoiceNote(language==='ta'?'குரலை இயக்க முடியவில்லை. “கேட்க” பொத்தானை அழுத்தி மீண்டும் முயற்சிக்கவும்.':'Could not play audio. Tap Listen to retry.');}});
     return;
   }
   const u=new SpeechSynthesisUtterance(text);u.voice=selected;u.lang=selected.lang;u.rate=.95;utterance.current=u;
   u.onstart=()=>{if(alive.current)setSpeaking(true);};u.onend=()=>{if(alive.current)setSpeaking(false);};u.onerror=(e)=>{if(alive.current){setSpeaking(false);if(e.error!=='canceled'&&e.error!=='interrupted')setVoiceNote(language==='ta'?'குரல் இயக்கப்படவில்லை. “கேட்க” பொத்தானை அழுத்தி முயற்சிக்கவும்.':'Playback was blocked or unavailable. Try the Listen button.');}};
   window.speechSynthesis.speak(u);
 }
 async function send(text=message, chosen?:Place, chosenDate?:string){
   if(busy||!text.trim())return;dictation.cancel();stop();if(autoSpeak&&!voice){try{prepareLocalSpeech();}catch{}}setBusy(true);setMessage('');const language=lang;
   setMessages(m=>[...m.slice(-15),{id:++seq.current,role:'user',text:text.trim(),lang:language}]);
   try{
     const reply=await askWeather(text,language,{place:place??context.current.place,date:date||context.current.date},chosen?{place:chosen,date:chosenDate}:undefined);
     if(!alive.current)return;
     if(reply.place){context.current.place=reply.place;setPlace(reply.place);}if(reply.date)context.current.date=reply.date;
     setMessages(m=>[...m,{id:++seq.current,role:'assistant',text:reply.text,lang:language,reply}]);
     if(autoSpeak)speak(reply.text,language);
   }catch{if(alive.current)setMessages(m=>[...m,{id:++seq.current,role:'assistant',lang:language,text:language==='ta'?'இணைய வானிலை சேவை தற்போது கிடைக்கவில்லை. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும். சென்சார் தரவு மாற்றாகப் பயன்படுத்தப்படவில்லை.':'The internet weather service is unavailable or its free limit was reached. Please retry later. Sensor readings have not been substituted.'}]);}
   finally{if(alive.current)setBusy(false);}
 }
 return <><a className="weather-shortcut" href="#weather"><CloudSun size={17}/>{ta?'வானிலை கேளுங்கள்':'Ask weather'}</a><section id="weather" className="weather-hub" aria-labelledby="weather-title">
  <div className="weather-intro"><span className="section-kicker"><CloudSun size={15}/> YOUR TAMIL NADU WEATHER COMPANION</span><h2 id="weather-title">{ta?'திட்டமிடுங்கள். வானிலையை அறியுங்கள்.':'A little weather wisdom.'}</h2><p>{ta?'தமிழ்நாட்டில் உங்கள் அடுத்த பயணத்திற்கு இணைய வானிலை. இடம், தேதி சொல்லுங்கள் — ஒன்றாகத் திட்டமிடலாம்.':'An outing in Ooty? An evening in Tambaram? Ask about your plans, and get an internet weather outlook.'}</p><span className="weather-source-pill"><span className="dot"/>{ta?'இணைய வானிலை · சென்சார் தரவு அல்ல':'INTERNET WEATHER · INDEPENDENT OF YOUR SENSORS'}</span></div>
  <div className="weather-grid">
   <aside className="weather-controls">
    <div className="weather-language" role="group" aria-label="Response language"><button className={!ta?'active':''} onClick={()=>{dictation.cancel();stop();setLang('en');setVoiceNote('');}}>English</button><button className={ta?'active':''} onClick={()=>{dictation.cancel();stop();setLang('ta');setVoiceNote('');}}>தமிழ்</button></div>
    <label className="weather-field"><span><MapPin size={14}/>{ta?'இடத்தைத் தேர்ந்தெடுக்கவும்':'Choose a place (optional)'}</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={ta?'நகரம் / ஊர் தேடவும்':'Search Tamil Nadu towns…'} maxLength={80}/></label>
    {searching&&<p className="weather-small" role="status">{ta?'தேடுகிறது…':'Searching…'}</p>}{searchNote&&<p className="weather-small" role="status">{searchNote}</p>}
    {!!places.length&&<div className="weather-places">{places.map(p=><button key={p.id} onClick={()=>{setPlace(p);setQuery('');setPlaces([]);}}><strong>{p.name}</strong><small>{p.admin2??p.admin1}</small></button>)}</div>}
    {place&&<div className="weather-selected"><MapPin size={14}/><span>{place.name}<small>Tamil Nadu</small></span><button aria-label="Clear selected place" onClick={()=>{setPlace(undefined);context.current.place=undefined;}}>×</button></div>}
    <label className="weather-field"><span><CalendarDays size={14}/>{ta?'நிகழ்ச்சி தேதி (விருப்பம்)':'Event date (optional)'}</span><input type="date" value={date} min={indiaDate()} onChange={e=>setDate(e.target.value)}/></label>
    {date&&<button className="weather-reset" onClick={()=>{setDate('');context.current.date=undefined;}}>{ta?'தேதியை நீக்கு':'Clear date'}</button>}
    <div className="weather-voice"><label><input type="checkbox" checked={autoSpeak} onChange={e=>{setAutoSpeak(e.target.checked);if(!e.target.checked)stop();}}/>{ta?'பதிலை வாசிக்கவும்':'Read replies aloud'}</label><p>{voice?`${voice.name}`:ta?'இலவச உள்ளூர் தமிழ் குரல் (செயற்கையான ஒலி)':'Free local voice (synthetic speech)'}</p>{speaking&&<button onClick={stop}><VolumeX size={14}/>{ta?'நிறுத்து':'Stop speaking'}</button>}</div>
    {voiceNote&&<p className="weather-voice-note" role="status">{voiceNote}</p>}
    <p className="weather-small">{ta?'இன்று மற்றும் அடுத்த 15 நாட்கள் வரை. அதற்கு அப்பால் தினசரி முன்னறிவிப்பு இன்னும் கிடைக்காது.':'Forecasts cover today and up to 15 days ahead. Later dates get an honest “not available yet”.'}</p>
    <a className="weather-attribution" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo <ArrowUpRight size={12}/></a><span className="weather-small">Locations: GeoNames · All times: IST · Cached up to 10 min</span><a className="weather-attribution" href="/speech/README.txt" target="_blank" rel="noreferrer">Local voice: eSpeak NG · source &amp; license ↗</a>
   </aside>
   <div className="weather-conversation">
    <div className="weather-chat-heading"><span className="weather-avatar"><Sparkles size={18}/></span><div><strong>EDITH Weather</strong><span>{ta?'தமிழ்நாடு மட்டும் · இலவச வானிலை உதவியாளர்':'Tamil Nadu only · Free weather assistant'}</span></div><span className="chip">EN / தமிழ்</span></div>
    <div className="weather-messages" role="log" aria-label={ta?'வானிலை உரையாடல்':'Weather conversation'} aria-live="polite" aria-relevant="additions">
     {!messages.length&&<div className="weather-welcome"><span>🌤️</span><h3>{ta?'உங்கள் அடுத்த திட்டம் என்ன?':'Where are you heading?'}</h3><p>{ta?'இடத்தையும் தேதியையும் சொல்லுங்கள். மழை வாய்ப்பு, வெப்பநிலை மற்றும் நிகழ்ச்சிக்கான ஆலோசனைகளை அறியலாம்.':'Tell me a place and date. I’ll look up rain chances, temperatures, and practical advice for your event.'}</p><div className="weather-prompts">{(ta?['நாளை தாம்பரத்தில் வானிலை எப்படி இருக்கும்?','இன்று மதுரையில் வானிலை எப்படி?','அக்டோபர் 31 அன்று சென்னையில் நிகழ்ச்சி உள்ளது']:['I have an outdoor event in Tambaram tomorrow','What is the weather in Madurai today?','I’m going to Tambaram Chennai on 31st of October']).map(p=><button onClick={()=>send(p)} key={p}>{p}<ArrowUpRight size={13}/></button>)}</div></div>}
     {messages.map(m=><article className={`weather-message ${m.role}`} key={m.id} lang={m.lang}><span className="weather-message-label">{m.role==='user'?(m.lang==='ta'?'நீங்கள்':'YOU'):'EDITH'}</span><p>{m.text}</p>{m.reply?.choices?.map(p=><button className="weather-choice" key={p.id} disabled={busy} onClick={()=>send(`${p.name} · Tamil Nadu`,p,m.reply?.date)}>{p.name} · {p.admin2??p.admin1}</button>)}{m.role==='assistant'&&<div className="weather-message-tools"><button onClick={()=>speak(m.text,m.lang)}><Volume2 size={13}/>{m.lang==='ta'?'கேட்க':'Listen'}</button>{m.reply?.source&&<a href={m.reply.source} target="_blank" rel="noreferrer">Open-Meteo ↗</a>}{m.reply?.fetchedAt&&<small>{new Date(m.reply.fetchedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST</small>}</div>}</article>)}
     {busy&&<div className="weather-thinking" role="status">{ta?'இணைய வானிலையைப் பார்க்கிறேன்…':'Checking internet weather…'}</div>}<div ref={bottom}/>
    </div>
    <form className="weather-compose" onSubmit={e=>{e.preventDefault();if(!dictation.active)void send();}}>
     <label className="weather-input-label" htmlFor="weather-question">{ta?'தட்டச்சு செய்யுங்கள் அல்லது பேசுங்கள்':'Type it. Or say it.'}</label>
     <div><textarea id="weather-question" rows={2} maxLength={600} value={message} disabled={busy} readOnly={dictation.active} aria-describedby="weather-mic-note" onChange={e=>setMessage(e.target.value)} placeholder={ta?'எங்கே, எப்போது செல்லத் திட்டமிடுகிறீர்கள்?':'Ask about a place, date, or your outdoor plans…'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!dictation.active)void send();}}}/><button disabled={busy||dictation.active||!message.trim()} aria-label={ta?'அனுப்பு':'Send weather question'}><Send size={18}/></button></div>
     <div className="weather-dictation">
      <button type="button" className={`weather-mic ${dictation.active?'recording':''}`} disabled={busy||!dictation.supported||dictation.state==='finishing'} aria-pressed={dictation.active} onClick={()=>{if(dictation.active)dictation.stop();else{stop();setVoiceNote('');dictation.start();}}}>
       {dictation.active?<Square size={15}/>:<Mic size={17}/>}<span>{dictation.active?(ta?'பேச்சை முடிக்கவும்':'Finish speaking'):(ta?'தமிழில் பேசுங்கள்':'Speak in English')}</span>
      </button><span>{ta?'பேசுங்கள் → சரிபாருங்கள் → அனுப்புங்கள்':'Speak → review → send'}</span>
     </div>
     <p id="weather-mic-note" className={`weather-mic-note ${dictation.active?'active':''}`} role="status">{dictation.note}</p>
     <small>{ta?'மைக் பொத்தானை அழுத்தும்போது மட்டுமே கேட்கும். உலாவி பேச்சை இணையச் சேவைக்கு அனுப்பலாம். API கட்டணம் இல்லை.':'Listens only when you tap the mic. Your browser may send audio to its speech service. No paid API.'}</small>
     <small>{ta?'தமிழ் அல்லது ஆங்கிலத்தில் கேளுங்கள். இது வானிலை உதவியாளர்; பொது அறிவு AI அல்ல.':'Ask in English or Tamil. Weather questions and follow-ups supported; not a general-purpose AI.'}</small>
    </form>
   </div>
  </div>
 </section></>;
}
