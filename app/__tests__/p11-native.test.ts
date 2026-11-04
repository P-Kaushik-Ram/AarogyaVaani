import { Platform } from 'react-native';
jest.mock('expo',()=>({requireOptionalNativeModule:jest.fn()}));
import { requireOptionalNativeModule } from 'expo';
import { loadSpeechEngine } from '../src/features/voice/feedbackNative';
beforeEach(()=>{jest.replaceProperty(Platform,'OS','android');(requireOptionalNativeModule as jest.Mock).mockReset();});
afterEach(()=>jest.restoreAllMocks());
test('TTS native lookup is optional and lazy; absence never crashes the Talk import',()=>{
 expect(requireOptionalNativeModule).not.toHaveBeenCalled();expect(loadSpeechEngine).toThrow('nativeMissing');expect(requireOptionalNativeModule).toHaveBeenCalledWith('ExpoSpeech');
});
test('only the installed documented native API is accepted',()=>{
 const native={getVoices:jest.fn(),stop:jest.fn(),speak:jest.fn(),addListener:jest.fn()};(requireOptionalNativeModule as jest.Mock).mockReturnValue(native);expect(loadSpeechEngine()).toMatchObject({getVoices:expect.any(Function),speak:expect.any(Function)});expect(native.getVoices).not.toHaveBeenCalled();
 (requireOptionalNativeModule as jest.Mock).mockReturnValue({});expect(loadSpeechEngine).toThrow('nativeMissing');
});


test.each(['en','hi','ta','ml','kn','te'])('%s adapter supplies verified regional voice and avoids SDK single-argument Locale tag fallback',async code=>{
 const voice={identifier:code+'-in-x-local',language:code+'-IN'};
 const native={getVoices:jest.fn(async()=>[voice]),stop:jest.fn(async()=>{}),speak:jest.fn(async()=>{}),addListener:jest.fn()};
 (requireOptionalNativeModule as jest.Mock).mockReturnValue(native);const engine=loadSpeechEngine();await engine.getVoices();
 await engine.speak('fixture','translated text',{language:code+'-IN',voice:voice.identifier});
 expect(native.speak).toHaveBeenCalledWith('fixture','translated text',{language:code,voice:voice.identifier});
 await expect(engine.speak('fixture','must not speak',{language:code==='en'?'ml-IN':'en-IN',voice:voice.identifier})).rejects.toThrow('language');
 await expect(engine.speak('fixture','must not speak',{language:code+'-IN',voice:'missing-local'})).rejects.toThrow('language');
 expect(native.speak).toHaveBeenCalledTimes(1);
});

test('missing or network-marked voices never reach native default fallback',async()=>{
 const native={getVoices:jest.fn(async()=>[{identifier:'ml-network',language:'ml-IN'}]),stop:jest.fn(),speak:jest.fn(),addListener:jest.fn()};
 (requireOptionalNativeModule as jest.Mock).mockReturnValue(native);const engine=loadSpeechEngine();
 await expect(engine.speak('fixture','not spoken',{language:'ml-IN',voice:'ml-network'})).rejects.toThrow('language');
 await engine.getVoices();await expect(engine.speak('fixture','not spoken',{language:'ml-IN',voice:'ml-network'})).rejects.toThrow('localVoice');
 expect(native.speak).not.toHaveBeenCalled();
});


test('a voice absent on refreshed discovery cannot use a previously cached identity',async()=>{
 const voice={identifier:'ml-in-x-local',language:'ml-IN'};
 const native={getVoices:jest.fn().mockResolvedValueOnce([voice]).mockResolvedValueOnce([]),stop:jest.fn(),speak:jest.fn(async()=>{}),addListener:jest.fn()};
 (requireOptionalNativeModule as jest.Mock).mockReturnValue(native);const engine=loadSpeechEngine();await engine.getVoices();await engine.getVoices();
 await expect(engine.speak('fixture','not spoken',{language:'ml-IN',voice:voice.identifier})).rejects.toThrow('language');expect(native.speak).not.toHaveBeenCalled();
});
