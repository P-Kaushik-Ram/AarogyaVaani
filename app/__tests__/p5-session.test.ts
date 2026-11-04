import { VoiceDriver,VoiceEvents,VoiceFailure,VoiceSession,voiceLimits } from '../src/features/voice/session';

function fixture(){
 let events!:VoiceEvents;
 const remove=jest.fn(),driver:VoiceDriver={available:jest.fn(()=>true),locales:jest.fn(async()=>['en-IN','hi-IN','ta-IN']),permission:jest.fn(async()=>({granted:true,canAskAgain:true})),subscribe:jest.fn(value=>{events=value;return remove;}),start:jest.fn(),stop:jest.fn(),abort:jest.fn()};
 const load=jest.fn(()=>driver),session=new VoiceSession(load),request={owner:{},locale:'en-IN',offline:false,onBegin:jest.fn(),onTranscript:jest.fn()};
 return {driver,session,request,load,remove,get events(){return events;}};
}
beforeEach(()=>jest.useFakeTimers());
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});
const result=(transcript:string,isFinal=true)=>({isFinal,results:[{transcript}]});

test('idle does no native work; repeated taps cannot overlap preflight, capture or processing',async()=>{
 const f=fixture();expect(f.load).not.toHaveBeenCalled();
 const starting=f.session.start(f.request);void f.session.start(f.request);await starting;
 expect(f.driver.start).toHaveBeenCalledTimes(1);expect(f.session.getState().phase).toBe('checking');
 f.events.start();expect(f.session.getState().phase).toBe('listening');
 f.session.stop(f.request.owner);f.session.stop(f.request.owner);void f.session.start(f.request);
 expect(f.driver.stop).toHaveBeenCalledTimes(1);expect(f.driver.start).toHaveBeenCalledTimes(1);expect(f.session.getState().phase).toBe('processing');
 f.events.result(result('Calcium at ten daily'));expect(f.request.onTranscript).not.toHaveBeenCalled();
 f.events.end();expect(f.request.onTranscript).toHaveBeenCalledWith('Calcium at ten daily');expect(f.session.getState()).toMatchObject({phase:'success',busy:false,partial:''});expect(f.remove).toHaveBeenCalledTimes(1);
});
test.each(['en-IN','hi-IN','ta-IN'])('%s requests precisely the selected supported locale',async locale=>{
 const f=fixture();await f.session.start({...f.request,locale});expect(f.driver.start).toHaveBeenCalledWith(locale);expect(f.session.getState().localeVerified).toBe(true);f.events.end();
});
test('interim text never commits and natural audioend waits for final plus end',async()=>{
 const f=fixture();await f.session.start(f.request);f.events.start();f.events.result(result('interim',false));
 expect(f.session.getState().partial).toBe('interim');expect(f.request.onTranscript).not.toHaveBeenCalled();
 f.events.audioend();expect(f.session.getState().phase).toBe('processing');f.events.end();
 expect(f.request.onTranscript).not.toHaveBeenCalled();expect(f.session.getState()).toMatchObject({problem:'noSpeech',busy:false});
});
test.each(['permission','unavailable','nativeMissing','network','locale','language'] as const)('%s rejection keeps typing available; only preflight failures prevent start',async problem=>{
 const f=fixture();
 if(problem==='permission')(f.driver.permission as jest.Mock).mockResolvedValue({granted:false,canAskAgain:false});
 if(problem==='unavailable')(f.driver.available as jest.Mock).mockReturnValue(false);
 if(problem==='nativeMissing')f.load.mockImplementation(()=>{throw new VoiceFailure('nativeMissing');});
 if(problem==='locale')(f.driver.locales as jest.Mock).mockResolvedValue(['ja-JP']);
 await f.session.start({...f.request,offline:problem==='network',locale:problem==='language'?undefined:'en-IN'});
 if(problem==='locale'){f.events.error({error:'language-not-supported',code:12});f.events.end();expect(f.driver.start).toHaveBeenCalledWith('en-IN');}
 else{expect(f.driver.start).not.toHaveBeenCalled();expect(f.request.onBegin).not.toHaveBeenCalled();}
 expect(f.session.getState()).toMatchObject({phase:'error',problem,busy:false});expect(f.request.onTranscript).not.toHaveBeenCalled();
});
test('bare locale and case normalization are supported without choosing a different locale',async()=>{
 const f=fixture();(f.driver.locales as jest.Mock).mockResolvedValue(['EN']);await f.session.start(f.request);expect(f.session.getState().localeVerified).toBe(true);expect(f.driver.start).toHaveBeenCalledWith('en-IN');f.events.end();
});
test.each(['empty','reject','timeout'])('unknown locale list (%s) permits an explicitly unverified attempt',async kind=>{
 const f=fixture();(f.driver.locales as jest.Mock).mockImplementation(()=>kind==='empty'?Promise.resolve([]):kind==='reject'?Promise.reject(new Error('unsupported')):new Promise(()=>{}));
 const starting=f.session.start(f.request);if(kind==='timeout')await jest.advanceTimersByTimeAsync(voiceLimits.capabilityMs);await starting;
 expect(f.session.getState()).toMatchObject({localeChecked:true,localeVerified:false});expect(f.driver.start).toHaveBeenCalledWith('en-IN');f.events.end();
});
test('cancel while permission is pending cannot start after permission resolves',async()=>{
 const f=fixture();let resolve!:(value:{granted:boolean;canAskAgain:boolean})=>void;
 (f.driver.permission as jest.Mock).mockImplementation(()=>new Promise(done=>{resolve=done;}));
 const start=f.session.start(f.request);await Promise.resolve();await Promise.resolve();await Promise.resolve();
 f.session.cancel(f.request.owner);void f.session.start(f.request);resolve({granted:true,canAskAgain:true});await start;
 expect(f.driver.permission).toHaveBeenCalledTimes(1);expect(f.driver.start).not.toHaveBeenCalled();expect(f.session.getState()).toMatchObject({phase:'cancelled',busy:false});
});
test('cancel drains end and ignores late results before allowing retry',async()=>{
 const f=fixture();await f.session.start(f.request);f.events.start();f.session.cancel(f.request.owner);
 expect(f.driver.abort).toHaveBeenCalledTimes(1);await f.session.start(f.request);expect(f.driver.start).toHaveBeenCalledTimes(1);
 f.events.result(result('must discard'));f.events.end();expect(f.request.onTranscript).not.toHaveBeenCalled();
 await f.session.start(f.request);expect(f.driver.start).toHaveBeenCalledTimes(2);f.events.end();
});
test.each([['not-allowed','permission'],['service-not-allowed','unavailable'],['audio-capture','unavailable'],['language-not-supported','locale'],['language-unavailable','locale'],['network','network'],['no-speech','noSpeech'],['speech-timeout','noSpeech'],['busy','busy'],['unknown','error']])('%s native errors map to %s and never commit',async(error,problem)=>{
 const f=fixture();await f.session.start(f.request);f.events.start();f.events.error({error});f.events.result(result('discard'));f.events.end();
 expect(f.session.getState()).toMatchObject({phase:'error',problem,busy:false});expect(f.request.onTranscript).not.toHaveBeenCalled();expect(f.driver.abort).not.toHaveBeenCalled();
});
test('unsolicited native abort is a visible error and no-match is no speech',async()=>{
 const f=fixture();await f.session.start(f.request);f.events.error({error:'aborted'});f.events.end();expect(f.session.getState()).toMatchObject({phase:'error',problem:'error'});
 await f.session.start(f.request);f.events.nomatch();f.events.end();expect(f.session.getState().problem).toBe('noSpeech');
});
test('oversized speech is rejected whole, never silently truncated',async()=>{
 const f=fixture();await f.session.start(f.request);f.events.result(result('a'.repeat(voiceLimits.characters+1)));f.events.end();
 expect(f.session.getState().problem).toBe('long');expect(f.request.onTranscript).not.toHaveBeenCalled();
});
test.each(['capture','processing'])('%s watchdog aborts; absent native end quarantines capture, not typing',async kind=>{
 const f=fixture();await f.session.start(f.request);f.events.start();if(kind==='processing')f.session.stop(f.request.owner);
 await jest.advanceTimersByTimeAsync(kind==='capture'?voiceLimits.sessionMs:voiceLimits.processingMs);
 expect(f.session.getState().problem).toBe('timeout');expect(f.driver.abort).toHaveBeenCalledTimes(1);
 await jest.advanceTimersByTimeAsync(voiceLimits.drainMs);expect(f.session.getState()).toMatchObject({problem:'reload',busy:false});
 f.session.reset(f.request.owner);await f.session.start(f.request);expect(f.session.getState()).toMatchObject({problem:'reload',busy:false});expect(f.driver.start).toHaveBeenCalledTimes(1);
});
test('only the owning screen may stop/cancel; unsubscribed prior callbacks cannot deliver later',async()=>{
 const f=fixture();await f.session.start(f.request);const old=f.events;f.events.start();f.session.stop({});f.session.cancel({});
 expect(f.driver.stop).not.toHaveBeenCalled();expect(f.driver.abort).not.toHaveBeenCalled();
 f.session.cancel(f.request.owner);f.events.end();await f.session.start({...f.request,owner:{}});
 old.result(result('old result'));old.end();expect(f.request.onTranscript).not.toHaveBeenCalled();expect(f.session.getState().busy).toBe(true);f.events.end();
});
test('start throwing aborts and cleans up rather than pretending to listen',async()=>{
 const f=fixture();(f.driver.start as jest.Mock).mockImplementation(()=>{throw new Error('native');});await f.session.start(f.request);f.events.end();
 expect(f.session.getState()).toMatchObject({phase:'error',problem:'error',busy:false});expect(f.request.onTranscript).not.toHaveBeenCalled();
});

test.each([[9,'service-not-allowed','permission'],[12,'language-not-supported','locale'],[13,'language-not-supported','locale'],[11,'network','network'],[5,'client','error']])('Tamil native code %s is visible as %s/%s and never delivers a late result',async(code,error,problem)=>{
 const f=fixture();await f.session.start({...f.request,locale:'ta-IN'});f.events.start();f.events.error({error:String(error),code:Number(code)});
 f.events.result(result('private medicine content'));f.events.end();
 expect(f.session.getState()).toMatchObject({phase:'error',problem,busy:false});expect(f.request.onTranscript).not.toHaveBeenCalled();
});

test('Tamil logs event timing and numeric errors without speech, error messages or scope',async()=>{
 const log=jest.spyOn(console,'debug').mockImplementation(()=>{}),f=fixture();
 await f.session.start({...f.request,locale:'ta-IN'});f.events.start();f.events.result(result('sensitive medicine',false));
 f.session.stop(f.request.owner);f.events.audioend();f.events.error({error:'sensitive native error',code:5});f.events.end();
 expect(log).toHaveBeenCalledWith('[voice]','native-error',expect.objectContaining({locale:'ta-IN',code:5,elapsedMs:expect.any(Number)}));
 expect(log.mock.calls.map(call=>JSON.stringify(call)).join(' ')).not.toMatch(/sensitive|transcript/);log.mockRestore();
});

test('Tamil explicit cancellation stays cancelled and discards late errors/results until end',async()=>{
 const f=fixture();await f.session.start({...f.request,locale:'ta-IN'});f.events.start();f.session.cancel(f.request.owner);
 f.events.error({error:'aborted',code:5});f.events.result(result('discard'));f.events.end();
 expect(f.session.getState()).toMatchObject({phase:'cancelled',busy:false});expect(f.request.onTranscript).not.toHaveBeenCalled();
});
