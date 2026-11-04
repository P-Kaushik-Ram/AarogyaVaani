import React,{useEffect,useRef,useState} from 'react';
import { router,useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/ui/Screen';
import { AppText } from '../../components/ui/Text';
import { PrimaryButton,SecondaryButton,TextButton } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/Glass';
import { StitchFoundation } from '../../design/ThemeProvider';
import { Dose } from '../tracking/doses';
import { useTracking } from '../tracking/useTracking';
import { apiAddress,notificationScope } from '../../services/api/session';
import { notificationIdentity,resolveAlert } from './identity';
import { dismissDoseAlerts,snoozeDose } from './service';
import { NotificationStatus } from './Status';

export function DoseAlertScreen(){return <StitchFoundation><AlertContent/></StitchFoundation>;}
function AlertContent(){
 const {notificationId,reminderId}=useLocalSearchParams<{notificationId:string;reminderId:string}>(),{t}=useTranslation();
 const [dose,setDose]=useState<Dose>(),[error,setError]=useState(false),[busy,setBusy]=useState(false),lock=useRef(false);
 const [address,setAddress]=useState('');
 const tracking=useTracking(dose?[dose]:[]);
 const current=tracking.doses[0];
 useEffect(()=>{
  let active=true;setDose(undefined);setError(false);
  void (async()=>{
   const identity=notificationIdentity(notificationId??''),base=await notificationScope(apiAddress());
   if(!identity||identity.scope!==base||String(identity.reminderId)!==reminderId)throw new Error('unavailable dose');
   const found=await resolveAlert(notificationId);if(active){setAddress(base);setDose(found);}
  })().catch(()=>{if(active)setError(true);});
  return()=>{active=false;};
 },[notificationId,reminderId]);
 async function act(action:'taken'|'skipped'|'pending'|5|10|'dismiss'){
  if(lock.current||!current||!tracking.ready)return;lock.current=true;setBusy(true);setError(false);
  try{
   if(await notificationScope(apiAddress())!==address)throw new Error('scope changed');
   if(typeof action==='number')await snoozeDose(address,current.reminderId,current.at,action);
   else if(action!=='dismiss'&&!await tracking.change(current,action))throw new Error('tracking failed');
   if(action!=='pending')await dismissDoseAlerts(address,current.reminderId,current.at);
   if(typeof action==='number'||action==='dismiss')router.replace('/today');
  }catch{setError(true);}finally{lock.current=false;setBusy(false);}
 }
 const disabled=busy||tracking.busy||!tracking.ready;
 return <Screen titleKey="p12.time" appearance="stitch">
  {(error||tracking.error)&&<AppText accessibilityRole="alert">{t('p12.error')}</AppText>}
  {!dose&&!error&&<AppText>{t('p8.loading')}</AppText>}
  {dose&&<GlassCard>
   <AppText variant="H1">{dose.medicine}</AppText>
   <AppText variant="TimeDisplay">{dose.time}</AppText>
   <AppText>{t('p12.scheduled',{date:dose.date,timezone:dose.timezone})}</AppText>
   {current&&<AppText accessibilityLiveRegion="polite">{t(`p8.${current.status}`)}</AppText>}
   {current?.status==='pending'?<>
    <PrimaryButton label={t('p8.taken')} disabled={disabled} onPress={()=>void act('taken')}/>
    <SecondaryButton label={t('p12.snooze5')} disabled={disabled} onPress={()=>void act(5)}/>
    <SecondaryButton label={t('p12.snooze10')} disabled={disabled} onPress={()=>void act(10)}/>
    <SecondaryButton label={t('p8.skip')} disabled={disabled} onPress={()=>void act('skipped')}/>
   </>:current&&<SecondaryButton label={t('p81.undo')} disabled={disabled} onPress={()=>void act('pending')}/>}
   <SecondaryButton label={t('p12.dismiss')} disabled={disabled} onPress={()=>void act('dismiss')}/>
   <AppText variant="Caption">{t('p12.dismissHint')}</AppText>
  </GlassCard>}
  <NotificationStatus compact/>
  <TextButton label={t('tab.today')} onPress={()=>router.replace('/today')}/>
 </Screen>;
}
