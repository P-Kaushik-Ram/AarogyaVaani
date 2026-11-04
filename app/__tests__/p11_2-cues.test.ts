import { CueEngine,CueFailure,CueKind,CuePlayback,CuePlayer,cueLimits } from '../src/features/voice/cues';

let status:(value:{didJustFinish:boolean;playing?:boolean;error?:unknown})=>void;
let player:jest.Mocked<CuePlayer>,engine:jest.Mocked<CueEngine>,load:jest.Mock,cues:CuePlayback,remove:jest.Mock;
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
beforeEach(()=>{
 jest.useFakeTimers();remove=jest.fn();
 player={volume:1,loop:false,isLoaded:true,play:jest.fn(),pause:jest.fn(),remove:jest.fn(),release:jest.fn(),addListener:jest.fn((_event,listener)=>{status=listener;return {remove};})};
 engine={configure:jest.fn(async()=>{}),create:jest.fn((_kind:CueKind)=>player)};load=jest.fn(()=>engine);cues=new CuePlayback(load);
});
afterEach(()=>{cues.cancel();jest.clearAllTimers();jest.useRealTimers();});

test('import and idle cancellation initialize no native audio',()=>{
 cues.cancel();expect(load).not.toHaveBeenCalled();
});

test.each(['start','stop'] as const)('%s cue awaits real finish, releases its player and includes an acoustic guard',async kind=>{
 const work=cues.play(kind);await flush();expect(engine.create).toHaveBeenCalledWith(kind);expect(player.play).toHaveBeenCalledTimes(1);
 let done=false;void work.then(()=>{done=true;});status({didJustFinish:false,playing:true});await flush();expect(done).toBe(false);
 status({didJustFinish:true});await flush();expect(player.pause).toHaveBeenCalledTimes(1);expect(player.remove).toHaveBeenCalledTimes(1);expect(player.release).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalledTimes(1);expect(done).toBe(false);
 await jest.advanceTimersByTimeAsync(cueLimits.tailMs);expect(await work).toEqual({safe:true});
});

test('overlapping playback requests do not create or queue a second player',async()=>{
 const work=cues.play('start');await flush();expect(await cues.play('stop')).toMatchObject({safe:false});
 expect(engine.create).toHaveBeenCalledTimes(1);status({didJustFinish:true});await jest.advanceTimersByTimeAsync(cueLimits.tailMs);await work;
});

test('silent/vibrate suppressed playback is a safe skip after bounded disposal',async()=>{
 const work=cues.play('start');await flush();await jest.advanceTimersByTimeAsync(cueLimits.playbackMs+cueLimits.tailMs);
 expect(await work).toEqual({safe:true});expect(player.remove).toHaveBeenCalledTimes(1);
});

test.each(['nativeMissing','configure','create','play','event','timeout'])('%s playback failure is contained and produces visible fallback metadata',async kind=>{
 if(kind==='nativeMissing')load.mockImplementation(()=>{throw new CueFailure('nativeMissing');});
 if(kind==='configure')engine.configure.mockRejectedValue(new Error('synthetic'));
 if(kind==='create')engine.create.mockImplementation(()=>{throw new Error('synthetic');});
 if(kind==='play')player.play.mockImplementation(()=>{throw new Error('synthetic');});
 if(kind==='timeout')player.isLoaded=false;
 const work=cues.play('start');await flush();
 if(kind==='event')status({didJustFinish:false,error:'sensitive native detail'});
 await jest.advanceTimersByTimeAsync(cueLimits.playbackMs+cueLimits.tailMs);
 expect(await work).toEqual({safe:true,problem:kind==='nativeMissing'?'nativeMissing':'error'});
});

test('unresolved audio configuration is bounded and cannot create a late player',async()=>{
 let resolve!:()=>void;engine.configure.mockImplementation(()=>new Promise<void>(done=>{resolve=done;}));
 const work=cues.play('start');await jest.advanceTimersByTimeAsync(cueLimits.operationMs);expect(await work).toEqual({safe:true,problem:'error'});
 resolve();await flush();expect(engine.create).not.toHaveBeenCalled();
});

test('cancel during configuration prevents stale playback even after it resolves',async()=>{
 let resolve!:()=>void;engine.configure.mockImplementation(()=>new Promise<void>(done=>{resolve=done;}));
 const work=cues.play('start');await flush();cues.cancel();resolve();expect(await work).toEqual({safe:true});expect(engine.create).not.toHaveBeenCalled();
});

test('cancel during playback disposes the cue and waits for its acoustic tail',async()=>{
 const work=cues.play('start');await flush();cues.cancel();await flush();expect(player.pause).toHaveBeenCalledTimes(1);
 await jest.advanceTimersByTimeAsync(cueLimits.tailMs);expect(await work).toEqual({safe:true});expect(remove).toHaveBeenCalledTimes(1);
});

test.each(['pause','remove','release'] as const)('failed native %s quarantines future output and blocks capture',async method=>{
 player[method].mockImplementation(()=>{throw new Error('synthetic');});const work=cues.play('start');await flush();status({didJustFinish:true});
 await jest.advanceTimersByTimeAsync(cueLimits.tailMs);expect(await work).toMatchObject({safe:false});expect(await cues.play('start')).toMatchObject({safe:false});expect(load).toHaveBeenCalledTimes(1);
});


test('P13.4 suppressed optional cue disposes by startup budget instead of full watchdog',async()=>{
 const work=cues.play('start');await flush();await jest.advanceTimersByTimeAsync(cueLimits.startMs-1);
 expect(player.release).not.toHaveBeenCalled();await jest.advanceTimersByTimeAsync(1);expect(player.pause).toHaveBeenCalledTimes(1);expect(player.release).toHaveBeenCalledTimes(1);
 let completed=false;void work.then(()=>{completed=true;});expect(completed).toBe(false);
 await jest.advanceTimersByTimeAsync(cueLimits.tailMs);expect(await work).toEqual({safe:true});
});
test('P13.4 observed playback keeps completion watchdog and does not expire at startup budget',async()=>{
 const work=cues.play('start');await flush();status({playing:true,didJustFinish:false});await jest.advanceTimersByTimeAsync(cueLimits.startMs+1);
 expect(player.release).not.toHaveBeenCalled();status({didJustFinish:true});await jest.advanceTimersByTimeAsync(cueLimits.tailMs);await work;expect(player.release).toHaveBeenCalledTimes(1);
});
test('P13.4 documented ended status completes without waiting for one-shot finish event',async()=>{
 const work=cues.play('start');await flush();status({didJustFinish:false,playbackState:'ended'} as Parameters<Parameters<CuePlayer['addListener']>[1]>[0]);
 await jest.advanceTimersByTimeAsync(cueLimits.tailMs);expect(await work).toEqual({safe:true});expect(player.release).toHaveBeenCalledTimes(1);
});

test('P13.4 play failure clears startup timer before disposing native player',async()=>{
 let released=false;Object.defineProperty(player,'isLoaded',{get:()=>{if(released)throw new Error('disposed player read');return true;}});
 player.play.mockImplementation(()=>{throw new Error('play failure');});player.release.mockImplementation(()=>{released=true;});
 const work=cues.play('start');await flush();await jest.advanceTimersByTimeAsync(cueLimits.tailMs);expect(await work).toEqual({safe:true,problem:'error'});
 await jest.advanceTimersByTimeAsync(cueLimits.playbackMs);expect(player.release).toHaveBeenCalledTimes(1);
});
