import { voiceDiagnostic } from './diagnostics';
import type { CueProblem,VoiceCues } from './cues';
export type VoiceProblem='permission'|'nativeMissing'|'unavailable'|'language'|'locale'|'network'|'noSpeech'|'busy'|'error'|'long'|'timeout'|'reload';
export type VoicePhase='idle'|'checking'|'listening'|'processing'|'success'|'error'|'cancelled';
export type VoiceState={phase:VoicePhase;busy:boolean;partial:string;locale?:string;localeChecked:boolean;localeVerified:boolean;problem?:VoiceProblem;cueProblem?:CueProblem};
export type VoiceEvents={start:()=>void;audioend:()=>void;result:(value:{isFinal:boolean;results:{transcript:string}[]})=>void;error:(value:{error:string;code?:number})=>void;nomatch:()=>void;end:()=>void};
export interface VoiceDriver {
 // Stable provider identity; absent identities are isolated to this driver object.
 service?:string;
 available():boolean;
 locales():Promise<string[]>;
 permission():Promise<{granted:boolean;canAskAgain:boolean}>;
 subscribe(events:VoiceEvents):()=>void;
 start(locale:string):void;
 stop():void;
 abort():void;
 ready?():Promise<void>;
}
export class VoiceFailure extends Error {constructor(public problem:VoiceProblem){super(problem);}}
type Request={tappedAt?:number;owner:object;locale?:string;offline:boolean;onBegin:()=>void;onTranscript:(text:string)=>void};
type Run={id:number;created:number;nativeStartedAt?:number;request:Request;driver?:VoiceDriver;unsubscribe?:()=>void;timer?:ReturnType<typeof setTimeout>;started:boolean;closing:boolean;ended?:boolean;final?:string};
export const voiceLimits={characters:300,capabilityMs:5000,permissionMs:30000,readyMs:5000,sessionMs:45000,processingMs:15000,drainMs:2500};
const initial:VoiceState={phase:'idle',busy:false,partial:'',localeChecked:false,localeVerified:false};

// One process-wide session owns the native recognizer. Cancel/error drains its end
// event before another start, since Android events have no JS session identifier.
export class VoiceSession {
 private state:VoiceState=initial;
 private listeners=new Set<()=>void>();
 private run?:Run;
 private quarantined=false;
 private sequence=0;
 private recovery?:VoiceDriver;
 private pendingPermission?:ReturnType<VoiceDriver['permission']>;
 private providerOutcomes=new Map<string,Map<string,boolean>>();
 private driverOutcomes=new WeakMap<VoiceDriver,Map<string,boolean>>();
 private normalizeLocale(value:string){return value.replaceAll('_','-').toLowerCase();}
 private outcomes(driver:VoiceDriver){
  if(driver.service){
   let values=this.providerOutcomes.get(driver.service);
   if(!values){values=new Map();this.providerOutcomes.set(driver.service,values);}
   return values;
  }
  let values=this.driverOutcomes.get(driver);
  if(!values){values=new Map();this.driverOutcomes.set(driver,values);}
  return values;
 }
 private recordLocale(run:Run,accepted:boolean){
  if(run.driver&&run.request.locale)this.outcomes(run.driver).set(this.normalizeLocale(run.request.locale),accepted);
 }
 private async bounded<T>(work:Promise<T>,ms:number):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new VoiceFailure('timeout')),ms);})]);}
  finally{clearTimeout(timer);}
 }
 private log(run:Run,event:string,details:Parameters<typeof voiceDiagnostic>[1]={}){
  voiceDiagnostic(event,{session:run.id,elapsedMs:Date.now()-run.created,locale:run.request.locale,phase:this.state.phase,...details});
 }
 constructor(private load:()=>VoiceDriver,private cues?:VoiceCues){}
 getState=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private update(value:Partial<VoiceState>){this.state={...this.state,...value};this.listeners.forEach(listener=>listener());}
 private current(run:Run){return this.run===run&&!run.closing&&!run.ended;}
 private release(run:Run,state:Partial<VoiceState>={}){
  if(this.run!==run)return;clearTimeout(run.timer);run.unsubscribe?.();this.run=undefined;this.update({...state,busy:false});
 }
 private drain(run:Run,abort=true){
  run.closing=true;clearTimeout(run.timer);
  // A lost JS end is recoverable only after the native idle handshake.
  // Without that capability retain the conservative reload fallback.
  run.timer=setTimeout(()=>{
   if(this.run!==run)return;this.log(run,'drain-timeout');
   if(run.driver?.ready){this.recovery=run.driver;this.release(run,{phase:'error',problem:'busy',partial:''});}
   else{this.quarantined=true;this.release(run,{phase:'error',problem:'reload',partial:''});}
  },voiceLimits.drainMs);
  if(abort)try{run.driver?.abort();}catch{/* Drain timeout handles a broken native session. */}
 }
 private fail(run:Run,problem:VoiceProblem,abort=true){
  if(this.run!==run)return;
  if(problem==='locale'){this.recordLocale(run,false);this.update({localeVerified:false});}
  this.log(run,'failure',{problem});
  this.update({phase:'error',problem,partial:''});
  if(run.started)this.drain(run,abort);else this.release(run);
 }
 private arm(run:Run,ms:number){clearTimeout(run.timer);run.timer=setTimeout(()=>{if(this.current(run))this.fail(run,'timeout');},ms);}
 private processing(run:Run){
  // Duplicate provider events must not extend the processing watchdog forever.
  if(this.state.phase!=='processing'){this.update({phase:'processing'});this.arm(run,voiceLimits.processingMs);}
 }
 async start(request:Request){
  if(this.run)return; // Includes permission dialogs, processing and native draining.
  if(this.quarantined){this.update({phase:'error',problem:'reload'});return;}
  if(!request.locale){this.update({...initial,phase:'error',problem:'language'});return;}
  const run:Run={id:++this.sequence,created:request.tappedAt??Date.now(),request,started:false,closing:false};this.run=run;
  this.log(run,'request');
  this.update({...initial,phase:'checking',busy:true,locale:request.locale,problem:undefined,cueProblem:undefined});
  try{
   if(this.recovery){
    await this.bounded(this.recovery.ready!(),voiceLimits.readyMs);
    if(this.run!==run||run.closing){this.release(run);return;}
    this.recovery=undefined;
   }
   if(request.offline)throw new VoiceFailure('network');
   let stage=Date.now();const driver=this.load();run.driver=driver;
   if(!driver.available())throw new VoiceFailure('unavailable');
   this.log(run,'startup-stage',{reason:'service',durationMs:Date.now()-stage});stage=Date.now();
   let locales:string[]=[];
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    locales=this.outcomes(driver).get(this.normalizeLocale(request.locale))===true?[]:await Promise.race([driver.locales(),new Promise<string[]>((_,reject)=>{timer=setTimeout(()=>reject(new Error('locale timeout')),voiceLimits.capabilityMs);})]);
   }catch{this.log(run,'capabilities-unknown');/* Enumeration is not supported by every provider. */}
   finally{clearTimeout(timer);}
   this.log(run,'startup-stage',{reason:'capabilities',durationMs:Date.now()-stage});
   if(this.run!==run)return;
   if(run.closing){this.release(run);return;}
   const target=this.normalizeLocale(request.locale);
   const reported=locales.some(value=>this.normalizeLocale(value)===target||this.normalizeLocale(value)===target.split('-')[0]);
   const outcome=this.outcomes(driver).get(target);
   const verified=outcome===true||(outcome===undefined&&reported);
   // Generic provider lists are positive hints, not authoritative exclusions.
   // An explicit user attempt still checks permission/idle and native errors.
   // A previous native rejection overrides a positive list until real success.
   this.log(run,'locale',{verified,count:locales.length,reason:outcome===true?'capture-completed':outcome===false?'native-rejected':reported?'provider-reported':'unverified'});
   this.update({localeChecked:true,localeVerified:verified});
   stage=Date.now();
   if(!this.pendingPermission){
    const pending=driver.permission();this.pendingPermission=pending;
    void pending.then(()=>{if(this.pendingPermission===pending)this.pendingPermission=undefined;},()=>{if(this.pendingPermission===pending)this.pendingPermission=undefined;});
   }
   const permission=await this.bounded(this.pendingPermission,voiceLimits.permissionMs);
   this.log(run,'permission',{granted:permission.granted,canAskAgain:permission.canAskAgain,durationMs:Date.now()-stage});
   if(this.run!==run)return;
   if(run.closing){this.release(run);return;}
   if(!permission.granted)throw new VoiceFailure('permission');
   stage=Date.now();if(driver.ready)await this.bounded(driver.ready(),voiceLimits.readyMs);
   this.log(run,'startup-stage',{reason:'native-idle',durationMs:Date.now()-stage});
   if(this.run!==run)return;
   if(run.closing){this.release(run);return;}
   request.onBegin();
   if(this.cues){
    stage=Date.now();const cue=await this.cues.play('start');
    this.log(run,'startup-stage',{reason:'start-cue',durationMs:Date.now()-stage});
    if(this.run!==run)return;
    if(run.closing){this.release(run);return;}
    this.update({cueProblem:cue.problem});
    if(!cue.safe){this.quarantined=true;throw new VoiceFailure('reload');}
   }
   run.unsubscribe=driver.subscribe({
    start:()=>{this.log(run,'ready',{durationMs:run.nativeStartedAt===undefined?undefined:Date.now()-run.nativeStartedAt});if(this.current(run)&&this.state.phase==='checking'){this.update({phase:'listening'});this.arm(run,voiceLimits.sessionMs);}},
    audioend:()=>{this.log(run,'audioend');if(this.current(run))this.processing(run);},
    result:event=>{
     if(!this.current(run))return;
     this.log(run,'result',{final:event.isFinal});
     const text=event.results[0]?.transcript?.trim()??'';
     if(text.length>voiceLimits.characters){this.fail(run,'long');return;}
     if(event.isFinal){run.final=text;this.processing(run);this.update({partial:text});}
     else this.update({partial:text});
    },
    error:event=>{
     // Log only numeric Android codes, including events received while draining.
     this.log(run,'native-error',{code:Number.isInteger(event.code)?event.code:undefined});
     if(!this.current(run))return;
     // An unsolicited provider abort is an error. Explicit user/lifecycle cancel
     // has already marked the run closing and is handled above.
     const map:Record<string,VoiceProblem>={'not-allowed':'permission','service-not-allowed':'unavailable','audio-capture':'unavailable','language-not-supported':'locale','language-unavailable':'locale','network':'network','no-speech':'noSpeech','speech-timeout':'noSpeech','busy':'busy'};
     // Android onError already schedules teardownAndEnd. Calling abort here
     // schedules a second teardown/end that can terminate the next capture.
     this.fail(run,event.code===9?'permission':event.code===12||event.code===13?'locale':map[event.error]??'error',false);
    },
    nomatch:()=>{this.log(run,'nomatch');if(this.current(run))this.fail(run,'noSpeech',false);},
    end:()=>{
     if(this.run!==run||run.ended)return;
     run.ended=true;clearTimeout(run.timer);
     this.log(run,'end');
     if(run.closing){this.release(run);return;}
     const text=run.final;
     if(!text){this.log(run,'empty-end',{problem:'noSpeech'});this.release(run,{phase:'error',problem:'noSpeech',partial:''});return;}
     // Keep ownership/busy through completion audio. A rapid tap cannot create
     // another capture, and the live TTS guard remains closed until silence.
     const deliver=()=>{
      if(this.run!==run)return;
      if(run.closing){this.release(run);return;}
      this.recordLocale(run,true);
      this.release(run,{phase:'success',partial:'',problem:undefined});request.onTranscript(text);
     };
     if(this.cues){
      void (async()=>{
       try{
        if(run.driver?.ready)await this.bounded(run.driver.ready(),voiceLimits.readyMs);
        if(run.closing){this.release(run);return;}
        const cue=await this.cues!.play('stop');
        if(this.run!==run)return;
        if(!cue.safe){this.quarantined=true;this.release(run,{phase:'error',problem:'reload',partial:''});return;}
        this.update({cueProblem:cue.problem??this.state.cueProblem});deliver();
       }catch(error){if(this.run===run)this.release(run,run.closing?{}:{phase:'error',problem:error instanceof VoiceFailure?error.problem:'error',partial:''});}
      })();
     }else deliver();
    },
   });
   run.started=true;this.arm(run,voiceLimits.readyMs);run.nativeStartedAt=Date.now();this.log(run,'native-start');driver.start(request.locale);
  }catch(error){if(this.current(run))this.fail(run,error instanceof VoiceFailure?error.problem:'error');else if(this.run===run&&!run.started)this.release(run);}
 }
 stop(owner:object){
  const run=this.run;if(!run||run.request.owner!==owner||run.closing||this.state.phase!=='listening')return;
  this.log(run,'stop');
  this.update({phase:'processing'});this.arm(run,voiceLimits.processingMs);
  try{run.driver?.stop();}catch{this.fail(run,'error');}
 }
 cancel(owner:object,reason='user'){
  const run=this.run;if(!run||run.request.owner!==owner||run.closing)return;
  this.log(run,'cancel',{reason});
  this.update({phase:'cancelled',partial:'',problem:undefined});
  this.cues?.cancel();
  if(run.started&&!run.ended)this.drain(run);
  else{
   run.closing=true;clearTimeout(run.timer);
   // Retain ownership while an uncancellable permission dialog is pending.
   // Both this deadline and ownership checks discard any eventual stale result.
   run.timer=setTimeout(()=>this.release(run),run.ended?voiceLimits.readyMs:voiceLimits.permissionMs);
  }
 }
 reset(owner:object){if(this.run)this.cancel(owner);else this.update({...initial,problem:undefined,cueProblem:undefined});}
 reportError(problem:VoiceProblem){if(!this.run)this.update({phase:'error',problem,partial:''});}
}
