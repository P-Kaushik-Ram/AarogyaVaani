import React, { useRef,useState } from 'react';
import { Pressable,View } from 'react-native';
import { DotsThreeVerticalIcon } from 'phosphor-react-native/src/icons/DotsThreeVertical';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard } from '../ui/Glass';
import { AppText } from '../ui/Text';
import { IconButton } from '../ui/IconButton';
import { Sheet } from '../ui/Sheet';
import { PrimaryButton,SecondaryButton } from '../ui/Button';
import { ApiStatus } from '../ui/ApiStatus';
import { Banner } from '../ui/Banner';
import { DeviceAlertState } from './TodayReminderCard';
import { NotificationStatus } from '../../features/notifications/Status';
import { cancelConfirmed,useNotificationHealth } from '../../features/notifications/service';
import { apiAddress } from '../../services/api/session';
import { DisplayReminder } from '../../features/reminders/cache';
import { recurrence,schedule } from '../../features/reminders/data';
import { useTheme } from '../../design/ThemeProvider';
import { stitch,stitchStyles } from '../../design/stitch';

export function ManagedMedicineCard({reminder:r}:{reminder:DisplayReminder}){
 const {t}=useTranslation(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth),health=useNotificationHealth(),cache=useQueryClient();
 const [stage,setStage]=useState<'menu'|'confirm'>(),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[deleted,setDeleted]=useState(false),lock=useRef(false);
 function close(){if(!lock.current){setStage(undefined);setError(undefined);}}
 function detail(){setStage(undefined);router.push({pathname:'/reminder/[id]',params:{id:r.id}});}
 async function cancel(){
  if(lock.current)return;lock.current=true;setBusy(true);setError(undefined);const base=apiAddress();
  try{await cancelConfirmed(base,r.id);setDeleted(true);setStage(undefined);void cache.invalidateQueries({queryKey:['reminders',base]});}
  catch(value){setError(value);}finally{lock.current=false;setBusy(false);}
 }
 if(deleted)return <View><Banner message={t('medicine.removed')}/><NotificationStatus compact/></View>;
 return <>
  <GlassCard testID={`medicine-card-${r.id}`} style={s.medicineCard}>
   <View style={s.medicineMain}>
    <View style={s.tileIcon}><PillIcon size={stitch.icon} color={colors.accent}/></View>
    <Pressable accessibilityRole="button" accessibilityLabel={[r.medicine,schedule(r,t),r.status==='paused'?t('p4.paused'):undefined,t('p42.deviceAlerts'),t(`p4.${health.status}Label`)].filter(Boolean).join(', ')} style={s.medicineDetails} onPress={detail}>
     <AppText variant="Title">{r.medicine}</AppText>
     <View style={s.todayTimes}>{r.times.map(time=><AppText key={time} variant="Title" numberOfLines={1} style={s.accent}>{time}</AppText>)}</View>
     <AppText variant="Caption" style={s.secondary}>{[recurrence(r.days_of_week,t),r.timezone].join(' · ')}</AppText>
     {r.status==='paused'&&<AppText variant="Caption" style={s.accent}>{t('p4.paused')}</AppText>}
    </Pressable>
    <IconButton compact icon={DotsThreeVerticalIcon} label={t('p43.manage',{medicine:r.medicine})} onPress={()=>setStage('menu')}/>
   </View>
   <View style={s.medicineBottom}><DeviceAlertState compact/></View>
  </GlassCard>
  <Sheet visible={!!stage} title={stage==='confirm'?t('medicine.deleteTitle',{medicine:r.medicine}):t('p43.manage',{medicine:r.medicine})} onClose={close}>
   {stage==='menu'?<>
    <SecondaryButton label={t('p43.details')} onPress={detail}/>
    <SecondaryButton label={t('action.delete')} onPress={()=>setStage('confirm')}/>
   </>:<>
    <AppText variant="SectionLabel">{r.medicine}</AppText><AppText variant="Caption">{schedule(r,t)}</AppText>
    {!!r.note&&<AppText variant="Caption">{r.note}</AppText>}
    <AppText>{t('medicine.deleteBody')}</AppText>
    <ApiStatus loading={busy} error={error}/>
    <PrimaryButton label={t('action.delete')} disabled={busy} onPress={()=>void cancel()}/>
    <SecondaryButton label={t('action.cancel')} disabled={busy} onPress={close}/>
   </>}
  </Sheet>
 </>;
}
