import type { LocalizedResponse } from '../chat/feedbackText';
import { useCallback,useEffect,useRef,useState } from 'react';
import { AppState,Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { usePreferences } from '../../store/preferences';
import { getLanguage } from '../../../config/languages';
import { FeedbackProblem } from './feedback';
import { speechFeedback } from './feedbackNative';
import { voiceDiagnostic } from './diagnostics';

export function useVoiceFeedback({language,scope,busy,isListening}:{language:string;scope:string;busy:boolean;isListening:()=>boolean}){
 const enabled=usePreferences(value=>value.voiceResponses);
 const [text,setText]=useState(''),[problem,setProblem]=useState<FeedbackProblem>();
 const focused=useRef(true),foreground=useRef(AppState.currentState!=='background'),version=useRef(0);
 const config=useRef({enabled,language,scope,isListening});config.current={enabled,language,scope,isListening};
 const invalidate=useCallback(()=>{version.current++;setText('');setProblem(undefined);},[]);
 const cancel=useCallback(()=>{invalidate();speechFeedback.cancel();},[invalidate]);
 useEffect(()=>{cancel();},[cancel,enabled,language,scope]);
 // Talk awaits silence before starting capture. Invalidate stale responses here,
 // but do not queue another native TTS stop after the recognizer has started.
 useEffect(()=>{if(busy)invalidate();},[busy,invalidate]);
 useFocusEffect(useCallback(()=>{focused.current=true;return()=>{focused.current=false;version.current++;speechFeedback.cancel();};},[language,scope]));
 useEffect(()=>{
  const subscriptions=[AppState.addEventListener('change',state=>{foreground.current=state==='active';if(state!=='active')cancel();})];
  if(Platform.OS==='android'){
   subscriptions.push(AppState.addEventListener('blur',()=>{foreground.current=false;cancel();}));
   subscriptions.push(AppState.addEventListener('focus',()=>{foreground.current=AppState.currentState!=='background';}));
  }
  return()=>{version.current++;focused.current=false;subscriptions.forEach(subscription=>subscription.remove());speechFeedback.cancel();};
 },[cancel]);
 const say=useCallback((response:LocalizedResponse)=>{
  const snapshot=config.current,locale=getLanguage(snapshot.language).ttsLocale,current=version.current;
  const allowed=()=>current===version.current&&snapshot.language===config.current.language&&snapshot.scope===config.current.scope&&!!config.current.enabled&&focused.current&&foreground.current&&!config.current.isListening();
  if(!locale||!allowed())return;
  voiceDiagnostic('tts-response',{selectedLanguage:snapshot.language,displayLanguage:response.language,textLanguage:response.language,locale,available:response.speakable,reason:response.speakable?'localized-template':'unverified-text-language'});
  if(response.language!==snapshot.language||!response.speakable){setProblem('error');return;}
  setText(response.text);setProblem(undefined);
  void speechFeedback.respond(response.text,locale,allowed,failure=>{if(allowed())setProblem(failure);});
 },[]);
 const prepareMicrophone=useCallback(async()=>{
  const started=Date.now();voiceDiagnostic('tts-handoff',{phase:'stopping'});
  invalidate();const current=version.current;
  const stopped=await speechFeedback.silence();
  if(current!==version.current||!focused.current||!foreground.current){voiceDiagnostic('tts-handoff',{phase:'cancelled'});setProblem('microphoneInterrupted');return false;}
  if(!stopped){voiceDiagnostic('tts-handoff',{phase:'error'});setProblem('stopFailed');return false;}
  voiceDiagnostic('tts-handoff',{phase:'silenced',durationMs:Date.now()-started});return true;
 },[invalidate]);
 const forRequest=useCallback(()=>{
  const current=version.current,snapshot=config.current;
  return (value:LocalizedResponse)=>{if(current===version.current&&snapshot.language===config.current.language&&snapshot.scope===config.current.scope)say(value);};
 },[say]);
 return {text,problem,say,cancel,prepareMicrophone,forRequest};
}
