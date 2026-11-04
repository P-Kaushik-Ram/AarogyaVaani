import { languages,voiceInputCodes,voiceInputLocale } from '../config/languages';
import { VoiceDriver,VoiceEvents,VoiceFailure,VoiceSession,voiceLimits } from '../src/features/voice/session';
import { canConfirm,isAnalysis,isReminder } from '../src/services/api/models';
import { selectLocalVoice } from '../src/features/voice/feedback';

function fixture(){
 let events!:VoiceEvents;
 const remove=jest.fn(),driver:jest.Mocked<VoiceDriver>={available:jest.fn(()=>true),locales:jest.fn(async()=>languages.map(l=>l.speechLocale)),permission:jest.fn(async()=>({granted:true,canAskAgain:true})),ready:jest.fn(async()=>{}),subscribe:jest.fn(e=>{events=e;return remove;}),start:jest.fn(),stop:jest.fn(),abort:jest.fn()};
 const session=new VoiceSession(()=>driver),request={owner:{},locale:'ta-IN',offline:false,onBegin:jest.fn(),onTranscript:jest.fn()};
 return {session,driver,request,remove,get events(){return events;}};
}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
beforeEach(()=>jest.useFakeTimers());
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});

test.each(languages)('$code ten sessions, stale and duplicate callbacks retain exclusive ownership',async language=>{
 const f=fixture();expect(voiceInputCodes).toContain(language.code);expect(voiceInputLocale(language.code)).toBe(language.speechLocale);
 let previous:VoiceEvents|undefined;
 for(let i=0;i<10;i++){
  await f.session.start({...f.request,locale:language.speechLocale});
  previous?.error({error:'network'});previous?.end();
  f.events.start();expect(f.session.getState().phase).toBe('listening');
  await f.session.start(f.request);expect(f.driver.start).toHaveBeenCalledTimes(i+1);
  f.events.result({isFinal:true,results:[{transcript:language.nativeName}]});f.events.end();f.events.end();previous=f.events;
  expect(f.session.getState().busy).toBe(false);expect(f.request.onTranscript).toHaveBeenCalledTimes(i+1);
 }
 expect(f.remove).toHaveBeenCalledTimes(10);
});

test('missing end permits retry only after native idle, without a second abort',async()=>{
 const f=fixture();await f.session.start(f.request);const old=f.events;f.events.start();f.session.cancel(f.request.owner,'navigation');
 await jest.advanceTimersByTimeAsync(voiceLimits.drainMs);expect(f.session.getState()).toMatchObject({busy:false,problem:'busy'});
 (f.driver.ready as jest.Mock).mockRejectedValueOnce(new VoiceFailure('busy'));await f.session.start(f.request);
 expect(f.driver.start).toHaveBeenCalledTimes(1);expect(f.session.getState().busy).toBe(false);
 await f.session.start(f.request);expect(f.driver.start).toHaveBeenCalledTimes(2);old.end();old.result({isFinal:true,results:[{transcript:'discard'}]});
 f.events.start();expect(f.session.getState().phase).toBe('listening');expect(f.request.onTranscript).not.toHaveBeenCalled();
 expect(f.driver.abort).toHaveBeenCalledTimes(1);f.events.end();
});

test.each(['timeout','cancel'] as const)('pending permission %s is bounded, shared and ignores stale completion',async kind=>{
 const f=fixture();let grant!:(v:{granted:boolean;canAskAgain:boolean})=>void;
 f.driver.permission.mockImplementationOnce(()=>new Promise(resolve=>{grant=resolve;}));
 const first=f.session.start(f.request);await flush();if(kind==='cancel')f.session.cancel(f.request.owner,'language');
 await jest.advanceTimersByTimeAsync(voiceLimits.permissionMs);await first;expect(f.session.getState().busy).toBe(false);
 expect(f.driver.start).not.toHaveBeenCalled();
 const retry=f.session.start({...f.request,locale:'ml-IN'});await flush();expect(f.driver.permission).toHaveBeenCalledTimes(1);
 grant({granted:true,canAskAgain:true});await retry;expect(f.driver.start).toHaveBeenCalledTimes(1);expect(f.driver.start).toHaveBeenCalledWith('ml-IN');f.events.end();
});

test('hanging readiness is bounded, and a late resolution cannot start a cancelled route',async()=>{
 const f=fixture();let ready!:()=>void;(f.driver.ready as jest.Mock).mockImplementationOnce(()=>new Promise<void>(resolve=>{ready=resolve;}));
 const start=f.session.start(f.request);await flush();f.session.cancel(f.request.owner,'route');
 await jest.advanceTimersByTimeAsync(voiceLimits.readyMs);await start;
 expect(f.session.getState().busy).toBe(false);ready();await flush();expect(f.driver.start).not.toHaveBeenCalled();
 await f.session.start(f.request);expect(f.driver.start).toHaveBeenCalledTimes(1);f.events.end();
});

test('permission denial followed by permission grant allows explicit retry',async()=>{
 const f=fixture();f.driver.permission.mockResolvedValueOnce({granted:false,canAskAgain:false});await f.session.start(f.request);
 expect(f.session.getState()).toMatchObject({problem:'permission',busy:false});await f.session.start(f.request);expect(f.driver.start).toHaveBeenCalledTimes(1);f.events.end();
});

test.each(languages)('$code validates Unicode drafts, confirmation, reminders and device TTS fallback',language=>{
 const draft={medicine:language.nativeName+' Brand',times:['20:00'],days_of_week:'daily',note:null};
 const analysis={detected_language:language.code,intent:'add_reminder',confidence:1,safety:{triggered:false,reason:null},draft,missing:[],candidates:{},matches:[],reply:{text:'Review',language:language.code}};
 expect(isAnalysis(analysis)).toBe(true);expect(canConfirm(analysis as any)).toBe(true);
 expect(canConfirm({...analysis,missing:['dosage']} as any)).toBe(false);
 expect(isReminder({...draft,id:1,user_id:'fixture',language:language.code,status:'active',timezone:'Asia/Kolkata',updated_at:'2026-10-18T00:00:00Z'})).toBe(true);
 const voice={identifier:language.code+'-local',language:language.ttsLocale};expect(selectLocalVoice([voice],language.ttsLocale)).toEqual(voice);
 expect(()=>selectLocalVoice([],language.ttsLocale)).toThrow('language');
 expect(()=>selectLocalVoice([{...voice,identifier:language.code+'-network'}],language.ttsLocale)).toThrow('localVoice');
});

test('unknown language never silently maps to English recognition',()=>expect(voiceInputLocale('xx')).toBeUndefined());


test('duplicate final/audioend events cannot postpone the processing watchdog indefinitely',async()=>{
 const f=fixture();await f.session.start(f.request);f.events.start();f.events.audioend();
 for(let i=0;i<2;i++){
  await jest.advanceTimersByTimeAsync(5000);f.events.audioend();f.events.result({isFinal:true,results:[{transcript:'never delivered without end'}]});
 }
 await jest.advanceTimersByTimeAsync(5000);expect(f.session.getState()).toMatchObject({phase:'error',problem:'timeout'});
 expect(f.driver.abort).toHaveBeenCalledTimes(1);expect(f.request.onTranscript).not.toHaveBeenCalled();f.events.end();expect(f.session.getState().busy).toBe(false);
});
