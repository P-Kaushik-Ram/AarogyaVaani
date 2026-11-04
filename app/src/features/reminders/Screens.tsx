import { cancelConfirmed } from '../notifications/service';
import { NotificationStatus } from '../notifications/Status';
import React, { useEffect, useRef, useState } from 'react';
import { TextField } from '../../components/ui/TextField';
import { ClarifyChips } from '../../components/ui/ClarifyChips';
import { TimeStepper } from '../../components/ui/TimeStepper';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/ui/Screen';
import { AppText } from '../../components/ui/Text';
import { PrimaryButton,SecondaryButton,DestructiveButton } from '../../components/ui/Button';
import { EmptyIllustration } from '../../components/brand/Glyphs';
import { Banner } from '../../components/ui/Banner';
import { ApiStatus } from '../../components/ui/ApiStatus';
import { ConnectionStatus } from '../../components/ui/ConnectionStatus';
import { ManagedMedicineCard } from '../../components/reminders/ManagedMedicineCard';
import { AddReminderButton } from '../../components/ui/AddReminderButton';
import { usePhaseNotice } from '../../hooks/usePhaseNotice';
import { apiAddress,getApi } from '../../services/api/session';
import { useReminders,schedule } from './data';
import { GlassCard } from '../../components/ui/Glass';
import { StitchFoundation,useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';

function ReminderList(){
 const {t}=useTranslation(),query=useReminders(),[pending,setPending]=useState(false),[error,setError]=useState<unknown>(),{colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth);
 useEffect(()=>{let active=true;setPending(false);setError(undefined);if(query.isSuccess)void getApi().hasPendingCreate().then(v=>{if(active)setPending(v);}).catch(e=>{if(active)setError(e);});return()=>{active=false;};},[query.dataUpdatedAt,query.isSuccess]);
 async function acknowledge(){try{await getApi().acknowledgeCreate();setPending(false);setError(undefined);}catch(e){setError(e);}}
 const items=query.data??[];
 return <Screen titleKey="tab.medicines" back={false} settings appearance="stitch">
  <ConnectionStatus loading={query.isPending&&query.data===undefined&&!query.error} error={query.error} secondaryError={error} cached={query.isCached||!!query.error&&query.data!==undefined} onRetry={()=>void query.refetch()}/>
  {pending&&!query.error&&!query.isFetching&&<><Banner message={t('api.uncertain')}/><SecondaryButton label={t('p2.reviewed')} onPress={()=>void acknowledge()}/></>}
  {query.data!==undefined&&<AppText variant="Caption" style={{color:colors.textSecondary}}>{t('p4.count',{count:items.length})}</AppText>}
  {!query.error&&query.data!==undefined&&items.length===0&&<GlassCard style={s.center}><EmptyIllustration kind="medicines"/><AppText style={s.alignCenter}>{t('medicine.empty')}</AppText></GlassCard>}
  {items.map(r=><ManagedMedicineCard key={r.id} reminder={r}/>)}
  <SecondaryButton label={t('p8.history')} onPress={()=>router.push('/history')}/>
  <AddReminderButton/>
  <NotificationStatus compact/>
  <SecondaryButton label={t('p2.refresh')} disabled={query.isFetching} onPress={()=>void query.refetch()}/>
 </Screen>;
}
export { TodayScreen } from './TodayScreen';
export function MedicinesScreen(){return <StitchFoundation><ReminderList/></StitchFoundation>;}
export function ReminderDetail(){
 const {id}=useLocalSearchParams<{id:string}>(),{t}=useTranslation(),query=useReminders(),cache=useQueryClient(),lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[deleted,setDeleted]=useState(false);
 const reminder=query.data?.find(r=>r.id===Number(id));
 async function cancel(){
  if(lock.current||!reminder)return;lock.current=true;setBusy(true);setError(undefined);const base=apiAddress();
  try{await cancelConfirmed(base,reminder!.id);setDeleted(true);void cache.invalidateQueries({queryKey:['reminders',base]});}
  catch(e){setError(e);}finally{setBusy(false);lock.current=false;}
 }
 return <Screen titleKey="tab.medicines"><ApiStatus loading={busy||query.isPending&&query.data===undefined&&!query.error} error={error||query.error} onRetry={()=>void query.refetch()}/>
  {deleted?<><Banner message={t('medicine.removed')}/><NotificationStatus/></>:reminder?<>
   <GlassCard><AppText variant="H2">{reminder.medicine}</AppText><AppText>{schedule(reminder,t)}</AppText>{reminder.note&&<AppText>{reminder.note}</AppText>}</GlassCard>
   <DestructiveButton label={t('action.delete')} title={t('medicine.deleteTitle',{medicine:reminder.medicine})} body={t('medicine.deleteBody')} disabled={busy||query.isFetching} onConfirm={()=>void cancel()}/>
  </>:!query.isPending&&!query.error&&<Banner message={t('medicine.removed')}/>}
  <SecondaryButton label={t('tab.medicines')} onPress={()=>router.replace('/medicines')}/>
 </Screen>;
}
export function ReminderForm({edit=false}:{edit?:boolean}){
 const {t}=useTranslation(),[name,setName]=useState(''),[note,setNote]=useState(''),[time,setTime]=useState({hour:8,minute:0}),[repeat,setRepeat]=useState('daily'),[paused,setPaused]=useState(false),[validation,setValidation]=useState(false),phase=usePhaseNotice();
 return <Screen titleKey={edit?'medicine.edit':'action.add'} phase><AppText>{t('offline.create')}</AppText><TextField label={t('medicine.name')} value={name} onChangeText={setName}/><AppText variant="H2">{t('medicine.schedule')}</AppText><TimeStepper value={time} onChange={setTime}/><AppText>{t('medicine.repeat')}</AppText><ClarifyChips options={[{value:'daily',label:t('medicine.daily')},{value:'days',label:t('medicine.days')}]} selected={repeat} onSelect={value=>{setRepeat(value);if(value==='days')phase.show();}}/><TextField label={t('medicine.note')} value={note} onChangeText={setNote} multiline/>{edit&&<SecondaryButton label={t('medicine.pause')} selected={paused} onPress={()=>setPaused(!paused)}/ >}{validation&&<Banner message={t('reminder.validation')}/>}<PrimaryButton label={t('action.save')} onPress={()=>{setValidation(!name.trim());if(name.trim())phase.show();}}/>{edit&&<DestructiveButton label={t('action.delete')} title={t('medicine.deleteTitle',{medicine:name||t('medicine.name')})} body={t('medicine.deleteBody')} onConfirm={phase.show}/ >}{phase.notice}</Screen>;
}
export { DoseAlertScreen } from '../notifications/AlertScreen';
