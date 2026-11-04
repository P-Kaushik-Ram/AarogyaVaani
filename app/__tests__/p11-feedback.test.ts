import { FeedbackFailure,SpeechEngine,SpeechFeedback,selectLocalVoice,feedbackLimits } from '../src/features/voice/feedback';
let engine:jest.Mocked<SpeechEngine>,load:jest.Mock,output:SpeechFeedback,events:Record<string,((event:{id:string})=>void)[]>,remove:jest.Mock;
const local={identifier:'en-in-x-local',language:'en-IN'};
beforeEach(()=>{
 events={};remove=jest.fn();engine={getVoices:jest.fn(async()=>[local]),stop:jest.fn(async()=>{}),speak:jest.fn(async(_id:string,_text:string,_options:{language:string;voice:string})=>{}),addListener:jest.fn((event,callback)=>{(events[event]??=[]).push(callback);return {remove};})};load=jest.fn(()=>engine);output=new SpeechFeedback(load);
});
afterEach(async()=>{await output.silence();jest.useRealTimers();});
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('disabled/busy guard initializes no native module and starts no audio',async()=>{
 await output.respond('details','en-IN',()=>false,jest.fn());expect(load).not.toHaveBeenCalled();expect(await output.silence()).toBe(true);
});
test.each(['en','hi','ta','ml','kn','te'])('%s uses matching local-marked voice without default or network fallback',language=>{
 const voice={identifier:language+'-in-x-local',language:language+'-IN'};
 expect(selectLocalVoice([local,voice,{identifier:language+'-network',language:language+'-IN'}],language+'-IN')).toEqual(voice);
});
test('missing language and network-only/unmarked engines fail closed',()=>{
 expect(()=>selectLocalVoice([local],'ta-IN')).toThrow('language');expect(()=>selectLocalVoice([{identifier:'ta-network',language:'ta-IN'}],'ta-IN')).toThrow('localVoice');
});
test('serial stop precedes every utterance; native options contain exact selected voice and no volume override',async()=>{
 const problem=jest.fn();await output.respond('Check before saving','en-IN',()=>true,problem);
 expect(engine.stop.mock.invocationCallOrder[0]).toBeLessThan(engine.speak.mock.invocationCallOrder[0]);expect(engine.speak).toHaveBeenCalledWith(expect.any(String),'Check before saving',{language:'en-IN',voice:local.identifier});expect(problem).not.toHaveBeenCalled();
 const id=engine.speak.mock.calls[0][0];events['Exponent.speakingDone'][0]({id:'stale'});expect(remove).not.toHaveBeenCalled();events['Exponent.speakingDone'][0]({id});expect(remove).toHaveBeenCalledTimes(3);
});
test('cancel during voice discovery discards late speech and removes any queued work',async()=>{
 let resolve!:(v:any)=>void;engine.getVoices.mockImplementation(()=>new Promise(done=>{resolve=done;}));const work=output.respond('stale','en-IN',()=>true,jest.fn());await tick();await output.silence();resolve([local]);await work;expect(engine.speak).not.toHaveBeenCalled();
});
test('microphone guard is checked again after async discovery',async()=>{
 let allowed=true;engine.getVoices.mockImplementation(async()=>{allowed=false;return [local];});await output.respond('stale','en-IN',()=>allowed,jest.fn());expect(engine.speak).not.toHaveBeenCalled();
});
test('superseding response drops stale voice lookup and only speaks newest request',async()=>{
 let resolve!:(v:any)=>void;engine.getVoices.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const first=output.respond('old','en-IN',()=>true,jest.fn());await tick();await output.respond('new','en-IN',()=>true,jest.fn());resolve([local]);await first;expect(engine.speak).toHaveBeenCalledTimes(1);expect(engine.speak.mock.calls[0][1]).toBe('new');
});
test.each(['nativeMissing','language','localVoice','error'] as const)('%s becomes a visible fallback with no wrong-language output',async failure=>{
 const problem=jest.fn();if(failure==='nativeMissing')load.mockImplementation(()=>{throw new FeedbackFailure(failure);});else if(failure==='language')engine.getVoices.mockResolvedValue([]);else if(failure==='localVoice')engine.getVoices.mockResolvedValue([{identifier:'en-network',language:'en-IN'}]);else engine.getVoices.mockRejectedValue(new Error('engine'));
 await output.respond('test','en-IN',()=>true,problem);expect(problem).toHaveBeenCalledWith(failure);expect(engine.speak).not.toHaveBeenCalled();
});
test('native error and rejected speak are handled, subscriptions clean up without unhandled rejection',async()=>{
 const problem=jest.fn();await output.respond('test','en-IN',()=>true,problem);const id=engine.speak.mock.calls[0][0];events['Exponent.speakingError'][0]({id});expect(problem).toHaveBeenCalledWith('error');expect(remove).toHaveBeenCalledTimes(3);
 engine.speak.mockRejectedValueOnce(new Error('failed'));await expect(output.respond('again','en-IN',()=>true,problem)).resolves.toBeUndefined();expect(remove).toHaveBeenCalledTimes(6);
});
test('failed stop blocks capture until an explicit retry acknowledges successful native stop',async()=>{
 await output.respond('test','en-IN',()=>true,jest.fn());engine.stop.mockRejectedValue(new Error('stop'));
 expect(await output.silence()).toBe(false);expect(engine.speak).toHaveBeenCalledTimes(1);
 engine.stop.mockResolvedValue();expect(await output.silence()).toBe(true);
 const problem=jest.fn();await output.respond('safe retry','en-IN',()=>true,problem);
 expect(problem).not.toHaveBeenCalled();expect(engine.speak).toHaveBeenCalledTimes(2);
});

test('engine voice-query timeout is bounded and never speaks a late result',async()=>{
 jest.useFakeTimers();let resolve!:(v:any)=>void;engine.getVoices.mockImplementation(()=>new Promise(done=>{resolve=done;}));const problem=jest.fn(),work=output.respond('test','en-IN',()=>true,problem);await tick();await jest.advanceTimersByTimeAsync(feedbackLimits.operationMs);await work;resolve([local]);await tick();expect(problem).toHaveBeenCalledWith('error');expect(engine.speak).not.toHaveBeenCalled();
});
test('missing utterance end is bounded; cancellation removes owned event handlers',async()=>{
 jest.useFakeTimers();const problem=jest.fn();await output.respond('test','en-IN',()=>true,problem);await jest.advanceTimersByTimeAsync(feedbackLimits.utteranceMs);expect(problem).toHaveBeenCalledWith('error');expect(remove).toHaveBeenCalledTimes(3);expect(engine.stop).toHaveBeenCalledTimes(2);
});

test('unacknowledged native speak quarantines output and microphone handoff until the late speak is acknowledged and an ordered stop succeeds',async()=>{
 jest.useFakeTimers();let resolve!:()=>void;engine.speak.mockImplementationOnce(()=>new Promise<void>(done=>{resolve=done;}));const problem=jest.fn(),work=output.respond('test','en-IN',()=>true,problem);await tick();await jest.advanceTimersByTimeAsync(feedbackLimits.operationMs);await work;expect(problem).toHaveBeenCalledWith('error');expect(await output.silence()).toBe(false);resolve();await tick();expect(await output.silence()).toBe(true);
});


test('a timed-out native stop cannot overlap a second stop or permit capture until acknowledgment',async()=>{
 jest.useFakeTimers();await output.respond('test','en-IN',()=>true,jest.fn());
 let acknowledge!:()=>void;engine.stop.mockImplementationOnce(()=>new Promise<void>(resolve=>{acknowledge=resolve;}));
 const stop=output.silence();await tick();await jest.advanceTimersByTimeAsync(feedbackLimits.operationMs);
 expect(await stop).toBe(false);expect(await output.silence()).toBe(false);expect(engine.stop).toHaveBeenCalledTimes(2);
 acknowledge();await tick();expect(await output.silence()).toBe(true);expect(engine.stop).toHaveBeenCalledTimes(3);
});
