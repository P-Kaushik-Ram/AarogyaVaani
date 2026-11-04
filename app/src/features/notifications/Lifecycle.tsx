import { useEffect,useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { usePreferences } from '../../store/preferences';
import { apiAddress } from '../../services/api/session';
import { reminderQueryOptions } from '../reminders/query';
import { useStartup } from '../../startup/Startup';
export function NotificationLifecycle(){
  const ready=usePreferences(p=>p.ready),address=usePreferences(p=>p.serverAddress),language=usePreferences(p=>p.language),cache=useQueryClient();
  const {backgroundReady}=useStartup();
  const sound=usePreferences(p=>p.reminderSound),vibration=usePreferences(p=>p.reminderVibration);
  const previousLanguage=useRef(language);
  useEffect(()=>{
    if(!ready||!backgroundReady)return;
    const languageChanged=previousLanguage.current!==language;previousLanguage.current=language;
    const refresh=async(foreground=false)=>{
      try{await cache.fetchQuery({...reminderQueryOptions(apiAddress()),...(foreground?{staleTime:0}:{})});}
      catch{/* Query errors remain visible; confirmed schedules survive. */}
    };
    void refresh(languageChanged);
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh(true);});
    return()=>subscription.remove();
  },[ready,backgroundReady,address,language,sound,vibration,cache]);
  return null;
}
