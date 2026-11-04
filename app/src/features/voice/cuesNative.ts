import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { CueEngine,CueFailure,CuePlayback } from './cues';

export function loadCueEngine():CueEngine {
 if(Platform.OS!=='android'||!requireOptionalNativeModule('ExpoAudio'))throw new CueFailure('nativeMissing');
 // The package eagerly loads its native module. Keep it behind the optional
 // lookup so the existing dev APK can still use recognition and working TTS.
 const audio:typeof import('expo-audio')=require('expo-audio');
 return {
  configure:()=>audio.setAudioModeAsync({playsInSilentMode:false,interruptionMode:'mixWithOthers',shouldPlayInBackground:false,allowsBackgroundRecording:false}),
  create:kind=>audio.createAudioPlayer(kind==='start'?require('../../../assets/audio/listen.wav'):require('../../../assets/audio/complete.wav'),{updateInterval:50,keepAudioSessionActive:false}),
 };
}
export const voiceCues=new CuePlayback(loadCueEngine);
