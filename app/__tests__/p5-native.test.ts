import { Platform } from 'react-native';
jest.mock('expo',()=>({requireOptionalNativeModule:jest.fn()}));
import { requireOptionalNativeModule } from 'expo';
import { loadVoiceDriver,waitForRecognitionIdle } from '../src/features/voice/native';
import { VoiceEvents } from '../src/features/voice/session';
let native:any;
beforeEach(()=>{
 jest.replaceProperty(Platform,'OS','android');
 native={start:jest.fn(),stop:jest.fn(),abort:jest.fn(),addListener:jest.fn(()=>({remove:jest.fn()})),isRecognitionAvailable:jest.fn(()=>true),getStateAsync:jest.fn(async()=> 'inactive'),getMicrophonePermissionsAsync:jest.fn(async()=>({granted:false,canAskAgain:true})),requestMicrophonePermissionsAsync:jest.fn(async()=>({granted:true,canAskAgain:true})),getSupportedLocales:jest.fn(async()=>({locales:['en-IN'],installedLocales:[]})),getDefaultRecognitionService:jest.fn(()=>({packageName:'fixture.speech.provider'}))};
 (requireOptionalNativeModule as jest.Mock).mockReset().mockReturnValue(native);
});
afterEach(()=>jest.restoreAllMocks());
test('optional native module absence and wrong platform fail gracefully',()=>{
 (requireOptionalNativeModule as jest.Mock).mockReturnValue(null);expect(loadVoiceDriver).toThrow('nativeMissing');
 jest.replaceProperty(Platform,'OS','ios');expect(loadVoiceDriver).toThrow('unavailable');
});
test('driver lookup is lazy; provider lookup and capture options match installed SDK types',async()=>{
 expect(requireOptionalNativeModule).not.toHaveBeenCalled();const driver=loadVoiceDriver();expect(requireOptionalNativeModule).toHaveBeenCalledWith('ExpoSpeechRecognition');
 expect(driver.service).toBe('fixture.speech.provider');expect(native.start).not.toHaveBeenCalled();expect(native.requestMicrophonePermissionsAsync).not.toHaveBeenCalled();expect(driver.available()).toBe(true);
 expect(await driver.locales()).toEqual(['en-IN']);expect(native.getSupportedLocales).toHaveBeenCalledWith({androidRecognitionServicePackage:'fixture.speech.provider'});
 driver.start('hi-IN');expect(native.start).toHaveBeenCalledWith({lang:'hi-IN',interimResults:true,continuous:false,maxAlternatives:1,requiresOnDeviceRecognition:false,recordingOptions:{persist:false},androidRecognitionServicePackage:'fixture.speech.provider'});
 driver.stop();driver.abort();expect(native.stop).toHaveBeenCalledWith();expect(native.abort).toHaveBeenCalledWith();
});
test.each([[true,true,0],[false,true,1],[false,false,0]])('permission granted=%s canAskAgain=%s prompts exactly %s times',async(granted,canAskAgain,count)=>{
 native.getMicrophonePermissionsAsync.mockResolvedValue({granted,canAskAgain});await loadVoiceDriver().permission();expect(native.requestMicrophonePermissionsAsync).toHaveBeenCalledTimes(count as number);
});
test('removes only owned event subscriptions; partial setup failure cleans up',()=>{
 const events:VoiceEvents={start:jest.fn(),audioend:jest.fn(),result:jest.fn(),error:jest.fn(),nomatch:jest.fn(),end:jest.fn()};
 const driver=loadVoiceDriver(),remove=driver.subscribe(events);expect(native.addListener.mock.calls.map(([name]:[string])=>name)).toEqual(['start','audioend','result','error','nomatch','end']);
 remove();for(const result of native.addListener.mock.results)expect(result.value.remove).toHaveBeenCalledTimes(1);
 const first={remove:jest.fn()};native.addListener.mockReset().mockReturnValueOnce(first).mockImplementationOnce(()=>{throw new Error('listener');});
 expect(()=>driver.subscribe(events)).toThrow('listener');expect(first.remove).toHaveBeenCalledTimes(1);
});

test('Tamil uses ta-IN online even without an installed offline Tamil model; logs metadata only',async()=>{
 const log=jest.spyOn(console,'debug').mockImplementation(()=>{});
 native.getSupportedLocales.mockResolvedValue({locales:['en-IN','hi-IN','ta-IN'],installedLocales:['en-IN']});
 const driver=loadVoiceDriver();expect(await driver.locales()).toContain('ta-IN');driver.start('ta-IN');
 expect(native.start).toHaveBeenCalledWith(expect.objectContaining({lang:'ta-IN',requiresOnDeviceRecognition:false,recordingOptions:{persist:false}}));
 expect(log).toHaveBeenCalledWith('[voice]','capabilities',{count:3,tamilSupported:true,tamilInstalled:false});
});

test('an incompatible APK missing a required method fails before capture',()=>{
 delete native.getSupportedLocales;expect(loadVoiceDriver).toThrow('nativeMissing');expect(native.start).not.toHaveBeenCalled();
});

test('restart waits for STOPPING to become inactive without aborting the native service',async()=>{
 jest.useFakeTimers();
 try{
  native.getStateAsync.mockResolvedValueOnce('stopping').mockResolvedValueOnce('inactive');
  const ready=waitForRecognitionIdle(native);await jest.advanceTimersByTimeAsync(50);await ready;
  expect(native.getStateAsync).toHaveBeenCalledTimes(2);expect(native.abort).not.toHaveBeenCalled();
 }finally{jest.useRealTimers();}
});

test.each(['active','hung'])('restart state query %s is bounded and visible as busy',async kind=>{
 jest.useFakeTimers();
 try{
  native.getStateAsync.mockImplementation(()=>kind==='hung'?new Promise(()=>{}):Promise.resolve('recognizing'));
  const ready=expect(waitForRecognitionIdle(native)).rejects.toThrow('busy');await jest.advanceTimersByTimeAsync(2550);await ready;
  expect(native.start).not.toHaveBeenCalled();expect(native.abort).not.toHaveBeenCalled();
 }finally{jest.useRealTimers();}
});
