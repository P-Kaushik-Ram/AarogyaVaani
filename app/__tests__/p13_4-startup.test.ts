import {VoiceSession,VoiceDriver,VoiceEvents} from '../src/features/voice/session';
import {languages} from '../config/languages';
function fixture(){
 let events!:VoiceEvents;
 const driver:jest.Mocked<VoiceDriver>={service:'provider.a',available:jest.fn(()=>true),locales:jest.fn(async()=>['ta-IN']),permission:jest.fn(async()=>({granted:true,canAskAgain:true})),ready:jest.fn(async()=>{}),subscribe:jest.fn(value=>{events=value;return jest.fn();}),start:jest.fn(),stop:jest.fn(),abort:jest.fn()};
 const session=new VoiceSession(()=>driver),request={owner:{},locale:'ta-IN',offline:false,onBegin:jest.fn(),onTranscript:jest.fn()};
 return {session,driver,request,get events(){return events;}};
}
beforeEach(()=>jest.useFakeTimers());
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});
const success=(f:ReturnType<typeof fixture>)=>{f.events.start();f.events.result({isFinal:true,results:[{transcript:'fixture'}]});f.events.end();};
test.each(languages)('$code successful capture skips advisory enumeration next time, but still checks permission/service/idle',async language=>{
 const f=fixture(),request={...f.request,locale:language.speechLocale};await f.session.start(request);success(f);
 f.driver.locales.mockImplementation(()=>new Promise(()=>{}));await f.session.start(request);
 expect(f.driver.locales).toHaveBeenCalledTimes(1);expect(f.driver.permission).toHaveBeenCalledTimes(2);expect(f.driver.available).toHaveBeenCalledTimes(2);expect(f.driver.ready).toHaveBeenCalledTimes(2);
 expect(f.driver.start).toHaveBeenLastCalledWith(language.speechLocale);f.events.end();
});
test('native rejection invalidates successful locale hint; provider/language changes enumerate independently',async()=>{
 const f=fixture();await f.session.start(f.request);success(f);await f.session.start(f.request);
 f.events.error({error:'language-not-supported',code:12});f.events.end();await f.session.start(f.request);
 expect(f.driver.locales).toHaveBeenCalledTimes(2);f.events.end();
 f.driver.service='provider.b';await f.session.start(f.request);expect(f.driver.locales).toHaveBeenCalledTimes(3);f.events.end();
 await f.session.start({...f.request,locale:'ml-IN'});expect(f.driver.locales).toHaveBeenCalledTimes(4);f.events.end();
});
test('timings include tap/handoff and native ready duration; checking never becomes listening before native event',async()=>{
 const f=fixture(),log=jest.spyOn(console,'debug').mockImplementation(()=>{}),tap=Date.now();
 await jest.advanceTimersByTimeAsync(70);await f.session.start({...f.request,tappedAt:tap});
 expect(f.session.getState().phase).toBe('checking');expect(log).toHaveBeenCalledWith('[voice]','request',expect.objectContaining({elapsedMs:70}));
 await jest.advanceTimersByTimeAsync(240);f.events.start();expect(f.session.getState().phase).toBe('listening');
 expect(log).toHaveBeenCalledWith('[voice]','ready',expect.objectContaining({elapsedMs:310,durationMs:240}));
 f.events.audioend();expect(f.session.getState().phase).toBe('processing');f.events.end();log.mockRestore();
});
