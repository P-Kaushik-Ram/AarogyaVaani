import React, { useEffect, useMemo, useState } from 'react';
import { AppState, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/ui/Screen';
import { AppText } from '../../components/ui/Text';
import { ConnectionStatus } from '../../components/ui/ConnectionStatus';
import { Banner } from '../../components/ui/Banner';
import { GlassCard } from '../../components/ui/Glass';
import { SecondaryButton, TextButton } from '../../components/ui/Button';
import { AddReminderButton } from '../../components/ui/AddReminderButton';
import { NextMedicineCard } from '../../components/reminders/NextMedicineCard';
import { TodayReminderCard } from '../../components/reminders/TodayReminderCard';
import { NotificationStatus } from '../notifications/Status';
import { StitchFoundation, useTheme } from '../../design/ThemeProvider';
import { stitch, stitchStyles } from '../../design/stitch';
import { createStyles } from '../../design/layout';
import { getApi } from '../../services/api/session';
import { useReminders } from './data';
import { nextMedicine } from './presentation';
import { scheduledDoses } from '../tracking/doses';
import { useTracking } from '../tracking/useTracking';
import { DailyProgress,DoseControls } from '../tracking/TrackingUI';

export function TodayScreen(){return <StitchFoundation><TodayDashboard/></StitchFoundation>;}

function TodayDashboard(){
 const {t}=useTranslation(),query=useReminders(),{colors,borderWidth,textSize}=useTheme();
 const shared=createStyles(colors,borderWidth),s=stitchStyles(colors,borderWidth),{width,fontScale}=useWindowDimensions();
 const [now,setNow]=useState(Date.now),[pending,setPending]=useState(false),[error,setError]=useState<unknown>();
 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),60000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active')setNow(Date.now());});
  return()=>{clearInterval(timer);sub.remove();};
 },[]);
 useEffect(()=>{
  let active=true;setPending(false);setError(undefined);
  if(query.isSuccess)void getApi().hasPendingCreate().then(value=>{if(active)setPending(value);}).catch(value=>{if(active)setError(value);});
  return()=>{active=false;};
 },[query.isSuccess,query.dataUpdatedAt]);
 const next=useMemo(()=>nextMedicine(query.data??[],now),[query.data,query.dataUpdatedAt,now]);
 const doses=useMemo(()=>scheduledDoses(query.data??[],new Date(now)),[query.data,now]);
 const tracking=useTracking(doses,query.dataUpdatedAt);
 const items=(query.data??[]).filter(r=>doses.some(d=>d.reminderId===r.id));
 const stacked=width<stitch.columnBreakpoint||textSize!=='standard'||fontScale>1;
 async function acknowledge(){try{await getApi().acknowledgeCreate();setPending(false);setError(undefined);}catch(value){setError(value);}}
 return <Screen titleKey="tab.today" back={false} settings appearance="stitch">
  <View testID="today-summary" style={shared.rowSpread}><AppText variant="SectionLabel" accessibilityRole="header">{t('p4.todayReminders')}</AppText>{query.data!==undefined&&<AppText variant="Caption" style={s.accent}>{t('p4.count',{count:items.length})}</AppText>}</View>
  {query.data!==undefined&&(next?<NextMedicineCard next={next}/>:<GlassCard style={s.card} testID="next-medicine-empty"><AppText variant="SectionLabel" style={s.accent}>{t('p4.nextMedicine')}</AppText><AppText variant="Caption" style={s.secondary}>{t('p42.noUpcoming')}</AppText></GlassCard>)}
  <ConnectionStatus loading={query.isPending&&query.data===undefined&&!query.error} error={query.error} secondaryError={error} cached={query.isCached||!!query.error&&query.data!==undefined} onRetry={()=>void query.refetch()}/>
  {pending&&!query.error&&!query.isFetching&&<><Banner message={t('api.uncertain')}/><SecondaryButton label={t('p2.reviewed')} onPress={()=>void acknowledge()}/></>}
  <View style={shared.stack}>
   {tracking.error&&<><AppText accessibilityRole="alert">{t('p8.error')}</AppText><TextButton label={t('p8.retry')} onPress={tracking.retry}/></>}
   {!query.error&&query.data!==undefined&&items.length===0&&<GlassCard><AppText variant="Caption" style={s.secondary}>{t('p2.todayEmpty')}</AppText></GlassCard>}
   <View style={s.compactStack}>{items.map(reminder=><TodayReminderCard key={reminder.id} reminder={reminder} stacked={stacked} timesInTracking={reminder.times.length>1&&tracking.doses.some(dose=>dose.reminderId===reminder.id)}><View style={s.doseList}>{tracking.doses.filter(dose=>dose.reminderId===reminder.id).map(dose=><DoseControls key={dose.key} dose={dose} disabled={!tracking.ready||tracking.busy} onChange={tracking.change} showTime={reminder.times.length>1}/>)}</View></TodayReminderCard>)}</View>
  </View>
  <AddReminderButton/>
  {query.data!==undefined&&<DailyProgress doses={tracking.doses} ready={tracking.ready} failed={tracking.error}/>}
  <NotificationStatus compact/>
  <TextButton label={t('p2.refresh')} disabled={query.isFetching} onPress={()=>{setNow(Date.now());void query.refetch();}}/>
 </Screen>;
}
