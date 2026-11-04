import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { VoiceDriver,VoiceFailure,VoiceSession } from './session';
import { voiceDiagnostic } from './diagnostics';
import { voiceCues } from './cuesNative';

type Native=typeof ExpoSpeechRecognitionModule;
// Native end is emitted just before the service changes STOPPING to INACTIVE.
// Poll the documented state instead of blindly starting over a draining client.
export async function waitForRecognitionIdle(native:Pick<Native,'getStateAsync'>){
 const deadline=Date.now()+2500;
 while(true){
  let timer:ReturnType<typeof setTimeout>|undefined;
  let state:string;
  try{state=await Promise.race([native.getStateAsync(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new VoiceFailure('busy')),Math.max(1,deadline-Date.now()));})]);}
  finally{clearTimeout(timer);}
  voiceDiagnostic('native-state',{phase:state});
  if(state==='inactive')return;
  if(Date.now()>=deadline)throw new VoiceFailure('busy');
  await new Promise<void>(resolve=>setTimeout(resolve,50));
 }
}
// Lazy lookup: importing Talk never requests permission or initializes recognition.
export function loadVoiceDriver():VoiceDriver {
 if(Platform.OS!=='android')throw new VoiceFailure('unavailable');
 const native=requireOptionalNativeModule<Native>('ExpoSpeechRecognition');
 if(!native||!['start','stop','abort','addListener','isRecognitionAvailable','getStateAsync','getMicrophonePermissionsAsync','requestMicrophonePermissionsAsync','getSupportedLocales','getDefaultRecognitionService'].every(name=>typeof (native as unknown as Record<string,unknown>)[name]==='function'))throw new VoiceFailure('nativeMissing');
 const service=native.getDefaultRecognitionService().packageName;
 voiceDiagnostic('native',{service:service||'default'});
 return {
  service:service||undefined,
  available:()=>{const available=native.isRecognitionAvailable();voiceDiagnostic('availability',{available});return available;},
  ready:()=>waitForRecognitionIdle(native),
  locales:async()=>{
   const result=await native.getSupportedLocales({androidRecognitionServicePackage:service||undefined});
   const tamil=(values:string[])=>values.some(value=>['ta','ta-in'].includes(value.replaceAll('_','-').toLowerCase()));
   voiceDiagnostic('capabilities',{count:result.locales.length,tamilSupported:tamil(result.locales),tamilInstalled:tamil(result.installedLocales)});
   return result.locales;
  },
  async permission(){let result=await native.getMicrophonePermissionsAsync();if(!result.granted&&result.canAskAgain)result=await native.requestMicrophonePermissionsAsync();return result;},
  subscribe(events){
   const subscriptions:{remove():void}[]=[];
   try{
    subscriptions.push(native.addListener('start',events.start));
    subscriptions.push(native.addListener('audioend',events.audioend));
    subscriptions.push(native.addListener('result',events.result));
    subscriptions.push(native.addListener('error',events.error));
    subscriptions.push(native.addListener('nomatch',events.nomatch));
    subscriptions.push(native.addListener('end',events.end));
   }catch(error){subscriptions.forEach(subscription=>subscription.remove());throw error;}
   return()=>subscriptions.forEach(subscription=>subscription.remove());
  },
  start:locale=>native.start({lang:locale,interimResults:true,continuous:false,maxAlternatives:1,requiresOnDeviceRecognition:false,recordingOptions:{persist:false},androidRecognitionServicePackage:service||undefined}),
  stop:()=>native.stop(),abort:()=>native.abort(),
 };
}
export const voiceSession=new VoiceSession(loadVoiceDriver,voiceCues);
