import { VoiceDriver,VoiceEvents,VoiceSession,voiceLimits } from '../src/features/voice/session';
import type { CueKind,VoiceCues } from '../src/features/voice/cues';

function fixture(withCues=false){
 let events!:VoiceEvents;
 const remove=jest.fn(),cues:jest.Mocked<VoiceCues>={play:jest.fn(async(_kind:CueKind)=>({safe:true})),cancel:jest.fn()};
 const driver:jest.Mocked<VoiceDriver>={available:jest.fn(()=>true),locales:jest.fn(async()=>['ta-IN','en-IN','hi-IN']),permission:jest.fn(async()=>({granted:true,canAskAgain:true})),ready:jest.fn(async()=>{}),start:jest.fn(),stop:jest.fn(),abort:jest.fn(),subscribe:jest.fn(value=>{events=value;return remove;})};
 const session=new VoiceSession(()=>driver,withCues?cues:undefined),request={owner:{},locale:'ta-IN',offline:false,onBegin:jest.fn(),onTranscript:jest.fn()};
 return {session,driver,cues,request,remove,get events(){return events;}};
}
const final={isFinal:true,results:[{transcript:'editable input'}]};
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
beforeEach(()=>jest.useFakeTimers());
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});

test.each(['ta-IN','en-IN','hi-IN'])('five %s sessions retain exclusive ownership through completion and remove listeners',async locale=>{
 const f=fixture(true);
 for(let i=0;i<5;i++){
  await f.session.start({...f.request,locale});f.events.start();
  f.session.stop(f.request.owner);f.session.stop(f.request.owner);expect(f.driver.stop).toHaveBeenCalledTimes(i+1);
  f.events.result(final);f.events.audioend();f.events.end();f.events.end();
  await f.session.start({...f.request,locale});expect(f.driver.start).toHaveBeenCalledTimes(i+1);
  await flush();expect(f.session.getState()).toMatchObject({phase:'success',busy:false});expect(f.request.onTranscript).toHaveBeenCalledTimes(i+1);
 }
 expect(f.cues.play.mock.calls.map(([kind])=>kind)).toEqual(Array(5).fill(['start','stop']).flat());
 expect(f.remove).toHaveBeenCalledTimes(5);expect(f.driver.abort).not.toHaveBeenCalled();
});

test.each(['error','nomatch'])('native %s must not enqueue a second teardown that can end the next Tamil capture',async kind=>{
 const f=fixture();
 // Model the installed module: a native terminal event already queues one end.
 // abort() would queue an additional end delivered to whichever listener is live.
 f.driver.abort.mockImplementation(()=>{setTimeout(()=>f.events.end(),100);});
 await f.session.start(f.request);f.events.start();f.events.result(final);f.events.end();
 await f.session.start(f.request);f.events.start();
 if(kind==='error')f.events.error({error:'no-speech',code:7});else f.events.nomatch();
 f.events.audioend();f.events.end();
 await f.session.start(f.request);f.events.start();await jest.advanceTimersByTimeAsync(100);
 expect(f.session.getState()).toMatchObject({phase:'listening',busy:true});expect(f.driver.abort).not.toHaveBeenCalled();
 f.events.result(final);f.events.end();expect(f.request.onTranscript).toHaveBeenCalledTimes(2);
});

test('rapid presses during cue preparation and completion cannot overlap recognition or sounds',async()=>{
 const f=fixture(true);let finish!:(value:{safe:boolean})=>void;
 f.cues.play.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const start=f.session.start(f.request);await flush();void f.session.start(f.request);expect(f.driver.start).not.toHaveBeenCalled();
 finish({safe:true});await start;f.events.start();
 f.cues.play.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));f.events.result(final);f.events.end();await flush();
 await f.session.start(f.request);expect(f.driver.start).toHaveBeenCalledTimes(1);expect(f.session.getState().busy).toBe(true);
 finish({safe:true});await flush();expect(f.session.getState().busy).toBe(false);expect(f.request.onTranscript).toHaveBeenCalledTimes(1);
});

test.each(['permission','native-error','empty-end','cancel'])('%s produces no completion cue and never commits text',async kind=>{
 const f=fixture(true);
 if(kind==='permission')f.driver.permission.mockResolvedValue({granted:false,canAskAgain:false});
 await f.session.start(f.request);
 if(kind!=='permission'){
  f.events.start();if(kind==='native-error')f.events.error({error:'network',code:11});
  if(kind==='cancel')f.session.cancel(f.request.owner);f.events.end();
 }
 await flush();expect(f.cues.play.mock.calls.map(([value])=>value)).not.toContain('stop');expect(f.request.onTranscript).not.toHaveBeenCalled();
 expect(f.session.getState().phase).toBe(kind==='cancel'?'cancelled':'error');
});

test.each(['start','stop'])('cancellation during %s cue discards late resolution and final text',async kind=>{
 const f=fixture(true);let done!:(value:{safe:boolean})=>void;
 if(kind==='stop'){await f.session.start(f.request);f.events.start();}
 f.cues.play.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
 const start=kind==='start'?f.session.start(f.request):undefined;
 if(kind==='stop'){f.events.result(final);f.events.end();}await flush();f.session.cancel(f.request.owner);
 expect(f.cues.cancel).toHaveBeenCalled();done({safe:true});await start;await flush();
 expect(f.session.getState()).toMatchObject({phase:'cancelled',busy:false});expect(f.request.onTranscript).not.toHaveBeenCalled();
});

test.each(['nativeMissing','error'] as const)('recoverable cue %s stays visible without disabling repeated recognition',async problem=>{
 const f=fixture(true);f.cues.play.mockResolvedValue({safe:true,problem});
 await f.session.start(f.request);f.events.start();f.events.result(final);f.events.end();await flush();
 expect(f.session.getState()).toMatchObject({phase:'success',cueProblem:problem});
 await f.session.start(f.request);expect(f.driver.start).toHaveBeenCalledTimes(2);f.events.end();
});

test('unsafe output release blocks capture with visible reload feedback',async()=>{
 const f=fixture(true);f.cues.play.mockResolvedValue({safe:false,problem:'error'});await f.session.start(f.request);
 expect(f.driver.start).not.toHaveBeenCalled();expect(f.session.getState()).toMatchObject({phase:'error',problem:'reload',busy:false});
});

test('second capture with no ready/end event produces a bounded visible timeout',async()=>{
 const f=fixture();await f.session.start(f.request);f.events.start();f.events.result(final);f.events.end();
 await f.session.start(f.request);await jest.advanceTimersByTimeAsync(voiceLimits.readyMs);
 expect(f.session.getState()).toMatchObject({phase:'error',problem:'timeout'});expect(f.driver.abort).toHaveBeenCalledTimes(1);
 f.events.end();expect(f.session.getState().busy).toBe(false);
});
