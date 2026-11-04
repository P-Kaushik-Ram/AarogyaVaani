import { voiceDiagnostic } from './diagnostics';
export type FeedbackProblem='nativeMissing'|'language'|'localVoice'|'error'|'stopFailed'|'microphoneInterrupted';
export type DeviceVoice={identifier:string;language:string};
export interface SpeechEngine {
 getVoices():Promise<DeviceVoice[]>;
 stop():Promise<void>;
 speak(id:string,text:string,options:{language:string;voice:string}):Promise<void>;
 addListener(event:string,listener:(value:{id:string})=>void):{remove():void};
}
export class FeedbackFailure extends Error {constructor(public problem:FeedbackProblem){super(problem);}}
export const feedbackLimits={operationMs:5000,utteranceMs:30000};
class SpeechTimeout extends Error {}
function bounded<T>(work:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>;
 return Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new SpeechTimeout('speech timeout')),feedbackLimits.operationMs);})]).finally(()=>clearTimeout(timer));
}
const normalize=(value:string)=>value.replaceAll('_','-').toLowerCase();
export function selectLocalVoice(voices:DeviceVoice[],locale:string){
 const target=normalize(locale),language=target.split('-')[0];
 const matching=voices.filter(voice=>normalize(voice.language).split('-')[0]===language);
 if(!matching.length)throw new FeedbackFailure('language');
 // Android ExpoSpeech omits isNetworkConnectionRequired. Only accept an explicit
 // engine-provided -local marker; never silently select a network/default voice.
 const local=matching.filter(voice=>voice.identifier.toLowerCase().endsWith('-local'));
 const selected=local.find(voice=>normalize(voice.language)===target)??local[0];
 if(!selected)throw new FeedbackFailure('localVoice');return selected;
}

// One output owner for the process. Every asynchronous boundary rechecks both
// generation and the live microphone/route/setting guard. Never replay a queue.
export class SpeechFeedback {
 private engine?:SpeechEngine;
 private generation=0;
 private serial:Promise<unknown>=Promise.resolve();
 private cleanup?:()=>void;
 private pendingSpeak?:Promise<void>;
 private pendingStop?:Promise<void>;
 constructor(private load:()=>SpeechEngine){}
 private stop(){
  this.cleanup?.();this.cleanup=undefined;
  const engine=this.engine;if(!engine)return Promise.resolve(true);
  const next=this.serial.catch(()=>{}).then(async()=>{
   try{
    // A timed-out speak may still be queued in native code. Acknowledge it
    // before stop; a successful ordered stop permits a safe explicit retry.
    if(this.pendingSpeak)return false;
    if(this.pendingStop)return false;
    const pending=engine.stop();this.pendingStop=pending;
    void pending.then(()=>{if(this.pendingStop===pending)this.pendingStop=undefined;},()=>{if(this.pendingStop===pending)this.pendingStop=undefined;});
    await bounded(pending);return true;
   }catch{return false;}
  });this.serial=next;return next;
 }
 silence(){this.generation++;return this.stop();}
 cancel(){void this.silence();}
 async respond(text:string,locale:string,allowed:()=>boolean,problem:(value:FeedbackProblem)=>void){
  const generation=++this.generation,current=()=>generation===this.generation&&allowed();
  if(!current())return;
  try{
   this.engine??=this.load();
   if(!await this.stop())throw new FeedbackFailure('stopFailed');
   if(!current())return;
   const voices=await bounded(this.engine.getVoices());
   const voice=selectLocalVoice(voices,locale);
   if(!current())return;
   voiceDiagnostic('tts-voice',{locale,voice:voice.identifier,voiceLanguage:voice.language,available:true,reason:'matching-local-voice-requested'});
   const id=`av-feedback-${generation}`,subscriptions:{remove():void}[]=[];
   let timer:ReturnType<typeof setTimeout>|undefined;
   const cleanup=()=>{clearTimeout(timer);subscriptions.forEach(subscription=>subscription.remove());if(this.cleanup===cleanup)this.cleanup=undefined;};
   this.cleanup=cleanup;
   const finish=(failed:boolean)=>(event:{id:string})=>{if(event.id!==id)return;cleanup();if(failed&&current())problem('error');};
   subscriptions.push(this.engine.addListener('Exponent.speakingDone',finish(false)));
   subscriptions.push(this.engine.addListener('Exponent.speakingStopped',finish(false)));
   subscriptions.push(this.engine.addListener('Exponent.speakingError',finish(true)));
   timer=setTimeout(()=>{if(current()){problem('error');this.cancel();}else cleanup();},feedbackLimits.utteranceMs);
   // Native speak is async; unlike the package's void wrapper, catch rejection.
   const pending=this.engine.speak(id,text,{language:voice.language,voice:voice.identifier});
   this.pendingSpeak=pending;
   void pending.then(()=>{if(this.pendingSpeak===pending)this.pendingSpeak=undefined;},()=>{if(this.pendingSpeak===pending)this.pendingSpeak=undefined;});
   await bounded(pending);
  }catch(error){
   if(current()){const failure=error instanceof FeedbackFailure?error.problem:'error';voiceDiagnostic('tts-failure',{locale,available:false,reason:failure});problem(failure);await this.silence();}
  }
 }
}
