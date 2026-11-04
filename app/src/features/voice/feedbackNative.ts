import { voiceDiagnostic } from './diagnostics';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { DeviceVoice,FeedbackFailure,SpeechEngine,SpeechFeedback } from './feedback';

export function loadSpeechEngine():SpeechEngine {
 if(Platform.OS!=='android')throw new FeedbackFailure('nativeMissing');
 const engine=requireOptionalNativeModule<SpeechEngine>('ExpoSpeech');
 if(!engine||!['getVoices','stop','speak','addListener'].every(name=>typeof (engine as unknown as Record<string,unknown>)[name]==='function'))throw new FeedbackFailure('nativeMissing');
 let voices:DeviceVoice[]=[];
 const language=(value:string)=>value.replaceAll('_','-').toLowerCase().split('-')[0];
 return {
  async getVoices(){voices=await engine.getVoices();return voices;},
  stop:()=>engine.stop(),
  addListener:(event,listener)=>engine.addListener(event,listener),
  speak(id,text,options){
   // Never send an absent, network-marked or other-language voice to native.
   // A failed lookup must not invoke the module's default-language fallback.
   const voice=voices.find(value=>value.identifier===options.voice&&language(value.language)===language(options.language));
   if(!voice)return Promise.reject(new FeedbackFailure('language'));
   if(!voice.identifier.toLowerCase().endsWith('-local'))return Promise.reject(new FeedbackFailure('localVoice'));
   // SDK 57 Android constructs Locale(it), not Locale.forLanguageTag(it).
   // Give it a valid language component; the explicit verified voice supplies
   // the actual regional locale (e.g. ml-IN), rather than device-default English.
   voiceDiagnostic('tts-native-request',{locale:language(options.language),voice:voice.identifier,voiceLanguage:voice.language,available:true,reason:'verified-voice-requested'});
   return engine.speak(id,text,{...options,language:language(options.language)});
  },
 };
}
// No native lookup/initialization at import or when voice responses are off.
export const speechFeedback=new SpeechFeedback(loadSpeechEngine);
