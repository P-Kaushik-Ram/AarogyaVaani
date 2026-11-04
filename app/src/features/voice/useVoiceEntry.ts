import { useCallback,useEffect,useRef,useSyncExternalStore } from 'react';
import { AppState,Linking,Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { voiceInputLocale } from '../../../config/languages';
import { voiceSession } from './native';

export function useVoiceEntry({language,scope,onBegin,onTranscript}:{language:string;scope:string;onBegin:()=>void;onTranscript:(text:string)=>void}){
 const key=language+'|'+scope,owner=useRef({}),callbacks=useRef({onBegin,onTranscript,key}),net=useNetInfo();callbacks.current={onBegin,onTranscript,key};
 const state=useSyncExternalStore(voiceSession.subscribe,voiceSession.getState,voiceSession.getState);
 const cancel=useCallback(()=>voiceSession.cancel(owner.current),[]);
 useEffect(()=>{
  voiceSession.reset(owner.current);
  const subscription=AppState.addEventListener('change',value=>{if(value==='background')voiceSession.cancel(owner.current,'background');});
  const blur=Platform.OS==='android'?AppState.addEventListener('blur',()=>voiceSession.cancel(owner.current,'android-blur')):undefined;
  return()=>{subscription.remove();blur?.remove();voiceSession.cancel(owner.current,'unmount-or-config');};
 },[cancel,language,scope]);
 useFocusEffect(useCallback(()=>()=>voiceSession.cancel(owner.current,'route-or-config'),[language,scope]));
 const locale=voiceInputLocale(language);
 return {...state,locale:state.locale??locale,supported:!!locale,
  start:(tappedAt?:number)=>voiceSession.start({tappedAt,owner:owner.current,locale,offline:net.isConnected===false||net.isInternetReachable===false,onBegin:()=>{if(callbacks.current.key===key)callbacks.current.onBegin();},onTranscript:text=>{if(callbacks.current.key===key)callbacks.current.onTranscript(text);}}),
  stop:()=>voiceSession.stop(owner.current),cancel,
  reset:()=>voiceSession.reset(owner.current),
  isBusy:()=>voiceSession.getState().busy,
  openSettings:()=>{cancel();void Linking.openSettings().catch(()=>voiceSession.reportError('error'));},
 };
}
