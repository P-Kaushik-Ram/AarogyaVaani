import { useCallback,useEffect,useRef,useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { usePreferences } from '../../store/preferences';
import { apiAddress } from '../../services/api/session';
import { Days } from '../../services/api/models';
import { TFunction } from 'i18next';
import { useStartup } from '../../startup/Startup';
import { reminderQueryOptions } from './query';
import { DisplayReminder,readCachedReminders } from './cache';
import { normalizeBase } from '../../services/api/client';

export function useReminders(){
  usePreferences(s=>s.serverAddress);
  let address=apiAddress();try{address=normalizeBase(address);}catch{/* The query reports invalid configuration. */}
  const {backgroundReady}=useStartup(),client=useQueryClient();
  const query=useQuery({...reminderQueryOptions(address),enabled:backgroundReady,refetchOnWindowFocus:false});
  const [local,setLocal]=useState<{address:string;data:DisplayReminder[]}>();
  useEffect(()=>{let active=true;void readCachedReminders(address).then(data=>{if(active)setLocal(data===undefined?undefined:{address,data});});return()=>{active=false;};},[address,query.isFetching]);
  const firstFocus=useRef(true);
  useFocusEffect(useCallback(()=>{
   if(firstFocus.current){firstFocus.current=false;return;}
   if(backgroundReady)void client.fetchQuery(reminderQueryOptions(address)).catch(()=>{});
  },[address,backgroundReady,client]));
  const cached=local?.address===address?local.data:undefined;
  const refetch=useCallback(()=>query.refetch({cancelRefetch:false}),[query.refetch]);
  return {...query,refetch,data:query.data??cached,isCached:query.data===undefined&&cached!==undefined};
}
export function recurrence(days:Days|null,t:TFunction){return days===null?t('p2.missing.frequency'):days==='daily'?t('medicine.daily'):days.map(d=>t(`p2.day${d}`)).join(', ');}
export function schedule(r:{times:string[];days_of_week:Days|null;timezone?:string},t:TFunction){return [r.times.join(', '),recurrence(r.days_of_week,t),r.timezone].filter(Boolean).join(' · ');}
export function occursToday(r:DisplayReminder,now=new Date()){
  if(r.status!=='active')return false;if(r.days_of_week==='daily')return true;
  const day=new Intl.DateTimeFormat('en-US',{timeZone:r.timezone,weekday:'short'}).format(now);
  return r.days_of_week.includes(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(day)+1);
}
