import { useEffect,useState } from 'react';
import { AppState } from 'react-native';
import { calendarDate } from './doses';

// Poll local calendar/timezone while foreground; resume catches clock/zone changes.
export function useLocalDay(){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{
  const refresh=()=>setNow(new Date());
  const timer=setInterval(refresh,30000),subscription=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
  return()=>{clearInterval(timer);subscription.remove();};
 },[]);
 return {now,key:calendarDate(now)+'|'+now.getTimezoneOffset()+'|'+Intl.DateTimeFormat().resolvedOptions().timeZone};
}
