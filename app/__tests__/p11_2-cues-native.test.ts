import { Platform } from 'react-native';
jest.mock('expo',()=>({requireOptionalNativeModule:jest.fn()}));
jest.mock('expo-audio',()=>({createAudioPlayer:jest.fn(),setAudioModeAsync:jest.fn(async()=>{})}));
import { requireOptionalNativeModule } from 'expo';
import { createAudioPlayer,setAudioModeAsync } from 'expo-audio';
import { loadCueEngine } from '../src/features/voice/cuesNative';

beforeEach(()=>{jest.replaceProperty(Platform,'OS','android');(requireOptionalNativeModule as jest.Mock).mockReset();});
afterEach(()=>jest.restoreAllMocks());

test('missing audio in the existing APK is a lazy fallback and initializes no player',()=>{
 expect(createAudioPlayer).not.toHaveBeenCalled();expect(loadCueEngine).toThrow('nativeMissing');
 expect(requireOptionalNativeModule).toHaveBeenCalledWith('ExpoAudio');expect(createAudioPlayer).not.toHaveBeenCalled();
});

test('audio configuration respects silent/vibrate, requests no focus, recording or background playback',async()=>{
 (requireOptionalNativeModule as jest.Mock).mockReturnValue({});const engine=loadCueEngine();await engine.configure();
 expect(setAudioModeAsync).toHaveBeenCalledWith({playsInSilentMode:false,interruptionMode:'mixWithOthers',shouldPlayInBackground:false,allowsBackgroundRecording:false});
 engine.create('start');engine.create('stop');expect(createAudioPlayer).toHaveBeenCalledTimes(2);
 for(const call of (createAudioPlayer as jest.Mock).mock.calls)expect(call[1]).toEqual({updateInterval:50,keepAudioSessionActive:false});
});

test('playback-only plugin does not request audio recording or background services',()=>{
 const app=require('../app.json').expo,plugin=app.plugins.find((value:unknown)=>Array.isArray(value)&&value[0]==='expo-audio');
 expect(plugin[1]).toEqual({microphonePermission:false,recordAudioAndroid:false,enableBackgroundRecording:false,enableBackgroundPlayback:false});
 // Recognition keeps its existing permission. Playback adds no runtime prompt.
 expect(app.android.permissions.filter((value:string)=>value.endsWith('RECORD_AUDIO'))).toHaveLength(1);
});
