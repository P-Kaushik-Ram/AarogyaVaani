import { languages } from '../config/languages';
import { VoiceDriver,VoiceEvents,VoiceSession,voiceLimits } from '../src/features/voice/session';
import type { VoiceCues,CueKind } from '../src/features/voice/cues';

function fixture(withCues=false){
 let events!:VoiceEvents;
 const remove=jest.fn(),driver:jest.Mocked<VoiceDriver>={service:'provider.a',available:jest.fn(()=>true),locales:jest.fn(async()=>['en-IN','hi-IN']),permission:jest.fn(async()=>({granted:true,canAskAgain:true})),ready:jest.fn(async()=>{}),subscribe:jest.fn(e=>{events=e;return remove;}),start:jest.fn(),stop:jest.fn(),abort:jest.fn()};
 const cues:jest.Mocked<VoiceCues>={play:jest.fn(async(_kind:CueKind)=>({safe:true})),cancel:jest.fn()};
 const load=jest.fn(()=>driver),session=new VoiceSession(load,withCues?cues:undefined),request={owner:{},locale:'ta-IN',offline:false,onBegin:jest.fn(),onTranscript:jest.fn()};
 return {session,driver,load,cues,request,remove,get events(){return events;}};
}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const result={isFinal:true,results:[{transcript:'benign editable input'}]};
beforeEach(()=>jest.useFakeTimers());
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});

test('device regression: first Tamil enumeration fails, capture succeeds, second omitting list cannot block capture',async()=>{
 const f=fixture(true);f.driver.locales.mockRejectedValueOnce(new Error('provider check failed'));
 await f.session.start(f.request);expect(f.session.getState().localeVerified).toBe(false);
 f.events.start();f.events.result(result);f.events.end();await flush();
 expect(f.session.getState()).toMatchObject({phase:'success',busy:false});
 // Production creates a new driver wrapper per request, with the same service ID.
 f.load.mockImplementation(()=>({...f.driver}));
 await f.session.start(f.request);expect(f.driver.start).toHaveBeenNthCalledWith(2,'ta-IN');expect(f.session.getState().localeVerified).toBe(true);
 f.events.start();f.events.result(result);f.events.end();await flush();
 expect(f.request.onTranscript).toHaveBeenCalledTimes(2);expect(f.cues.play.mock.calls.map(([kind])=>kind)).toEqual(['start','stop','start','stop']);
});

test.each(languages)('$code unlisted locale gets an unverified exact-locale attempt, never English fallback',async language=>{
 const f=fixture();f.driver.locales.mockResolvedValue(['ja-JP']);await f.session.start({...f.request,locale:language.speechLocale});
 expect(f.session.getState()).toMatchObject({localeChecked:true,localeVerified:false});expect(f.driver.start).toHaveBeenCalledWith(language.speechLocale);f.events.end();
});

test.each([['language-not-supported',undefined],['language-unavailable',undefined],['unknown',12],['unknown',13]] as const)('native %s/%s revokes successful evidence and stays a visible hard failure',async(error,code)=>{
 const f=fixture();await f.session.start(f.request);f.events.result(result);f.events.end();await f.session.start(f.request);
 expect(f.session.getState().localeVerified).toBe(true);f.events.error({error,code});f.events.result(result);f.events.end();
 expect(f.session.getState()).toMatchObject({problem:'locale',phase:'error',busy:false,localeVerified:false});expect(f.request.onTranscript).toHaveBeenCalledTimes(1);
 // Even a positive generic list cannot override an explicit rejection.
 f.driver.locales.mockResolvedValue(['ta-IN']);await f.session.start(f.request);expect(f.session.getState().localeVerified).toBe(false);
 f.events.result(result);f.events.end();await f.session.start(f.request);expect(f.session.getState().localeVerified).toBe(true);f.events.end();
});

test.each(['permission','unavailable'] as const)('%s still prevents native startup despite a prior successful locale',async kind=>{
 const f=fixture();await f.session.start(f.request);f.events.result(result);f.events.end();
 if(kind==='permission')f.driver.permission.mockResolvedValue({granted:false,canAskAgain:false});else f.driver.available.mockReturnValue(false);
 await f.session.start(f.request);expect(f.session.getState()).toMatchObject({phase:'error',problem:kind,busy:false});expect(f.driver.start).toHaveBeenCalledTimes(1);
});

test('provider and locale changes cannot reuse another provider or language success',async()=>{
 const f=fixture();await f.session.start(f.request);f.events.result(result);f.events.end();
 f.driver.service='provider.b';await f.session.start(f.request);expect(f.session.getState().localeVerified).toBe(false);f.events.end();
 f.driver.service='provider.a';await f.session.start({...f.request,locale:'ml-IN'});expect(f.session.getState().localeVerified).toBe(false);f.events.end();
 await f.session.start(f.request);expect(f.session.getState().localeVerified).toBe(true);f.events.end();
});

test('unknown providers are isolated by driver identity',async()=>{
 const f=fixture();delete f.driver.service;await f.session.start(f.request);f.events.result(result);f.events.end();
 f.load.mockImplementation(()=>({...f.driver}));await f.session.start(f.request);expect(f.session.getState().localeVerified).toBe(false);f.events.end();
});

test.each(['cancel','empty','error','unsafe-cue'] as const)('%s cannot establish a successful locale',async kind=>{
 const f=fixture(kind==='unsafe-cue');await f.session.start(f.request);
 if(kind==='cancel'){f.events.result(result);f.session.cancel(f.request.owner);}
 if(kind==='error')f.events.error({error:'network'});
 if(kind==='unsafe-cue'){f.cues.play.mockResolvedValueOnce({safe:false});f.events.result(result);}
 f.events.end();await flush();
 expect(f.request.onTranscript).not.toHaveBeenCalled();expect(f.session.getState().localeVerified).toBe(false);
});

test('completion ownership prevents cancelled final text from poisoning locale evidence',async()=>{
 const f=fixture(true);await f.session.start(f.request);let complete!:(v:{safe:boolean})=>void;
 f.cues.play.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));f.events.result(result);f.events.end();await flush();
 f.session.cancel(f.request.owner);complete({safe:true});await flush();await f.session.start(f.request);
 expect(f.session.getState().localeVerified).toBe(false);expect(f.request.onTranscript).not.toHaveBeenCalled();f.events.end();await flush();
});

test('timeout drains safely; retry uses exact locale and old callbacks cannot revoke newer success',async()=>{
 const f=fixture();await f.session.start(f.request);const old=f.events;f.events.start();
 await jest.advanceTimersByTimeAsync(voiceLimits.sessionMs);expect(f.session.getState().problem).toBe('timeout');f.events.end();
 await f.session.start(f.request);f.events.result(result);f.events.end();await f.session.start(f.request);
 old.error({error:'language-not-supported',code:12});old.end();expect(f.session.getState()).toMatchObject({busy:true,localeVerified:true});f.events.end();
});

test('stale timed-out capability result cannot change a newer language or start a cancelled request',async()=>{
 const f=fixture();let resolve!:(v:string[])=>void;f.driver.locales.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const first=f.session.start(f.request);await flush();f.session.cancel(f.request.owner,'language');await jest.advanceTimersByTimeAsync(voiceLimits.capabilityMs);await first;
 await f.session.start({...f.request,locale:'hi-IN'});resolve(['ta-IN']);await flush();
 expect(f.session.getState()).toMatchObject({locale:'hi-IN',localeVerified:true});expect(f.driver.start).toHaveBeenCalledTimes(1);expect(f.driver.start).toHaveBeenCalledWith('hi-IN');f.events.end();
});

test('ten rapid consecutive Tamil sessions with omitted capability entries never overlap',async()=>{
 const f=fixture();for(let i=0;i<10;i++){
  const start=f.session.start(f.request);void f.session.start(f.request);await start;f.events.start();
  expect(f.driver.start).toHaveBeenCalledTimes(i+1);f.events.result(result);f.events.end();
 }
 expect(f.request.onTranscript).toHaveBeenCalledTimes(10);expect(f.remove).toHaveBeenCalledTimes(10);
});

test('cancelled capture drains before retry, and language switching preserves only each locale own evidence',async()=>{
 const f=fixture();await f.session.start(f.request);f.events.start();f.session.cancel(f.request.owner);
 await f.session.start(f.request);expect(f.driver.start).toHaveBeenCalledTimes(1);f.events.end();
 await f.session.start({...f.request,locale:'ml-IN'});expect(f.session.getState().localeVerified).toBe(false);f.events.result(result);f.events.end();
 await f.session.start(f.request);expect(f.session.getState().localeVerified).toBe(false);f.events.result(result);f.events.end();
 await f.session.start({...f.request,locale:'ml-IN'});expect(f.session.getState().localeVerified).toBe(true);f.events.end();
});

test('fresh session controller forgets successful and rejected capability evidence',async()=>{
 const f=fixture();await f.session.start(f.request);f.events.result(result);f.events.end();
 const fresh=new VoiceSession(f.load);await fresh.start(f.request);expect(fresh.getState().localeVerified).toBe(false);f.events.end();
});
