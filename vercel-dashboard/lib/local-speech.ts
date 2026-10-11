// SPDX-License-Identifier: GPL-3.0-or-later
// EDITH adapter for the separately hosted eSpeak NG worker.
// Audio is synthesized on this device; no text is sent to a speech service.
let context: AudioContext | undefined;
let worker: Worker | undefined;
let source: AudioBufferSourceNode | undefined;
let generation=0;
export function prepareLocalSpeech() {
  context??=new AudioContext();
  void context.resume().catch(()=>{});
}
export function stopLocalSpeech() {
  generation++;worker?.terminate();worker=undefined;
  if(source){source.onended=null;source.stop();source.disconnect();source=undefined;}
}
export function speakLocally(text:string,language:'en'|'ta',onStart:()=>void,onEnd:()=>void,onError:()=>void){
  stopLocalSpeech();const ticket=generation;
  try {prepareLocalSpeech();}catch{onError();return;}
  worker=new Worker('/speech/espeakng.worker.js');
  const chunks:Float32Array[]=[];
  const timeout=setTimeout(()=>{if(ticket===generation){stopLocalSpeech();onError();}},25000);
  worker.onerror=()=>{clearTimeout(timeout);if(ticket===generation){stopLocalSpeech();onError();}};
  worker.onmessage=async(event)=>{
    if(ticket!==generation)return;
    if(event.data==='ready'){
      worker?.postMessage({method:'set_rate',args:[155]});
      worker?.postMessage({method:'set_voice',args:[language==='ta'?'ta':'en']});
      worker?.postMessage({method:'synthesize',args:[text.slice(0,3000)],callback:'edith'});
    } else if(event.data.callback==='edith'){
      if(event.data.result?.[0] instanceof ArrayBuffer)chunks.push(new Float32Array(event.data.result[0]));
      if(event.data.done){
        clearTimeout(timeout);worker?.terminate();worker=undefined;
        const length=chunks.reduce((sum,c)=>sum+c.length,0);
        if(!length||!context){onError();return;}
        try {
          // The upstream worker duplicates each 22.05kHz mono sample twice.
          const buffer=context.createBuffer(1,length,44100);let offset=0;
          for(const chunk of chunks){buffer.getChannelData(0).set(chunk,offset);offset+=chunk.length;}
          await context.resume();if(ticket!==generation)return;
          if(context.state!=='running'){onError();return;}
          source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);
          source.onended=()=>{if(ticket===generation){source=undefined;onEnd();}};
          source.start();onStart();
        }catch{onError();}
      }
    }
  };
}
