import { useEffect,useRef,useState } from 'react';
import { apiAddress,trackingScope } from '../../services/api/session';
import { usePreferences } from '../../store/preferences';
import { Dose,DoseStatus } from './doses';
import { readDoses,recordDose,snapshotDoses,subscribeDoses } from './storage';

export function useTracking(scheduled:Dose[],revision:string|number=0){
 usePreferences(s=>s.serverAddress);const address=apiAddress();
 const [state,setState]=useState<{address:string;scope:string;rows:Dose[]}>(),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const [retryVersion,setRetryVersion]=useState(0);
 const lock=useRef(false),generation=useRef(0);
 const signature=JSON.stringify(scheduled);
 useEffect(()=>{
  const version=++generation.current;setState(undefined);setError(false);
  void (async()=>{try{
   const scope=await trackingScope(address);await snapshotDoses(scope,JSON.parse(signature));const rows=await readDoses(scope);
   if(version===generation.current)setState({address,scope,rows});
  }catch{if(version===generation.current)setError(true);}})();
  return()=>{generation.current++;};
 },[address,signature,revision,retryVersion]);
 useEffect(()=>{
  let active=true;
  const unsubscribe=subscribeDoses(scope=>{
   if(!state||scope!==state.scope)return;
   void readDoses(scope).then(rows=>{if(active)setState(value=>value?.scope===scope?{...value,rows}:value);}).catch(()=>{if(active)setError(true);});
  });
  return()=>{active=false;unsubscribe();};
 },[state?.scope]);
 async function change(dose:Dose,status:DoseStatus){
  if(lock.current||!state||state.address!==address)return false;
  const version=generation.current;lock.current=true;setBusy(true);setError(false);
  try{const next=await recordDose(state.scope,dose,status);if(version===generation.current)setState(value=>value?{...value,rows:[...value.rows.filter(row=>row.key!==next.key),next]}:value);return true;}
  catch{if(version===generation.current)setError(true);return false;}
  finally{lock.current=false;setBusy(false);}
 }
 const rows=state?.address===address?state.rows:[];
 return {rows,error,busy,ready:!!state&&state.address===address,retry:()=>setRetryVersion(value=>value+1),change,doses:scheduled.map(dose=>({...dose,...rows.find(row=>row.key===dose.key)}))};
}
