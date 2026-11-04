import { voiceDiagnostic } from './diagnostics';

export type CueKind='start'|'stop';
export type CueProblem='nativeMissing'|'error';
export type CueResult={safe:boolean;problem?:CueProblem};
export interface VoiceCues {play(kind:CueKind):Promise<CueResult>;cancel():void;}
export interface CuePlayer {
 volume:number;loop:boolean;isLoaded:boolean;
 play():void;pause():void;remove():void;release():void;
 addListener(event:'playbackStatusUpdate',listener:(value:{didJustFinish:boolean;playbackState?:string;playing?:boolean;error?:unknown})=>void):{remove():void};
}
export interface CueEngine {configure():Promise<void>;create(kind:CueKind):CuePlayer;}
export class CueFailure extends Error {constructor(public problem:CueProblem){super(problem);}}
export const cueLimits={operationMs:2000,playbackMs:2000,startMs:500,tailMs:180};

function bounded<T>(work:Promise<T>){
 let timer:ReturnType<typeof setTimeout>;
 return Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('cue timeout')),cueLimits.operationMs);})]).finally(()=>clearTimeout(timer));
}

// At most one cue, with no queue/replay. Capture waits for completion and resource
// disposal. Cancellation has a short acoustic tail guard before capture can resume.
export class CuePlayback implements VoiceCues {
 private generation=0;
 private busy=false;
 private quarantined=false;
 private finish?:()=>void;
 constructor(private load:()=>CueEngine){}
 cancel(){this.generation++;this.finish?.();}
 async play(kind:CueKind):Promise<CueResult>{
  if(this.busy||this.quarantined)return {safe:false,problem:'error'};
  this.busy=true;const generation=++this.generation;
  let player:CuePlayer|undefined,subscription:{remove():void}|undefined,timer:ReturnType<typeof setTimeout>|undefined,startup:ReturnType<typeof setTimeout>|undefined;
  let result:CueResult={safe:true};const created=Date.now();
  try{
   const engine=this.load();const configure=Date.now();await bounded(engine.configure());
   voiceDiagnostic('cue-stage',{phase:kind,reason:'configure',durationMs:Date.now()-configure});
   if(generation!==this.generation)return result;
   player=engine.create(kind);player.volume=1;player.loop=false;
   await new Promise<void>(resolve=>{
    const playback=Date.now();let played=false;
    let finished=false;
    const finish=(failed=false,reason='completed')=>{if(finished)return;finished=true;voiceDiagnostic('cue-stage',{phase:kind,reason,durationMs:Date.now()-playback});clearTimeout(startup);if(failed)result.problem='error';resolve();};
    this.finish=()=>finish(false,'cancelled');
    subscription=player!.addListener('playbackStatusUpdate',value=>{played ||= value.playing===true;if(played)clearTimeout(startup);if(value.error)finish(true);else if(value.didJustFinish||value.playbackState==='ended')finish();});
    // Android suppresses play() in silent/vibrate without a finish event. A
    // loaded player that never began is a safe skipped cue after disposal.
    timer=setTimeout(()=>{try{finish(played||!player!.isLoaded,'playback-deadline');}catch{finish(true);}},cueLimits.playbackMs);
    // Optional beep must not hold capture for the full playback watchdog when
    // Android suppresses it. Disposal and acoustic tail still precede capture.
    startup=setTimeout(()=>{try{if(!played)finish(!player!.isLoaded,'start-not-observed');}catch{finish(true);}},cueLimits.startMs);
    player!.play();
   });
  }catch(error){result.problem=error instanceof CueFailure?error.problem:'error';}
  finally{
   this.finish=undefined;clearTimeout(timer);clearTimeout(startup);
   try{subscription?.remove();}catch{/* Resource stop below remains authoritative. */}
   if(player){
    try{player.pause();}catch{result.safe=false;}
    try{player.remove();}catch{result.safe=false;}
    // SDK 57 Android remove() drops module ownership; SharedObject.release()
    // also disposes the underlying player rather than waiting for JS garbage collection.
    try{player.release();}catch{result.safe=false;}
    if(!result.safe)this.quarantined=true;
    await new Promise<void>(resolve=>setTimeout(resolve,cueLimits.tailMs));
   }
   this.busy=false;
   voiceDiagnostic('cue',{durationMs:Date.now()-created,phase:kind,problem:result.problem,reason:result.safe?'released':'unsafe'});
  }
  return result;
 }
}
