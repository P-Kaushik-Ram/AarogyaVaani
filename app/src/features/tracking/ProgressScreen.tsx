import React,{useCallback,useState} from 'react';
import { Pressable,View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/ui/Screen';
import { AppText } from '../../components/ui/Text';
import { GlassCard } from '../../components/ui/Glass';
import { TextButton } from '../../components/ui/Button';
import { StitchFoundation,useTheme } from '../../design/ThemeProvider';
import { stitchStyles } from '../../design/stitch';
import { Dose,calendarDate } from './doses';
import { weeklyProgress } from './weekly';
import { useTracking } from './useTracking';
import { useLocalDay } from './useLocalDay';
import { HistoryDoseCard } from './TrackingUI';

const empty:Dose[]=[];
export function ProgressScreen(){return <StitchFoundation><Progress/></StitchFoundation>;}
function Progress(){
 const {t,i18n}=useTranslation(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth),clock=useLocalDay();
 const [revision,setRevision]=useState(0),[selected,setSelected]=useState<string>(),[info,setInfo]=useState(false);
 useFocusEffect(useCallback(()=>{setRevision(value=>value+1);},[]));
 const tracking=useTracking(empty,clock.key+'|'+revision),week=weeklyProgress(tracking.rows,clock.now);
 const chosen=week.days.find(day=>day.date===selected)??week.days[6];
 return <Screen titleKey="p9.title" appearance="stitch">
  <AppText variant="Caption" style={s.secondary}>{t('p9.subtitle')}</AppText>
  {tracking.error&&<AppText accessibilityRole="alert">{t('p8.error')}</AppText>}
  {!tracking.ready&&!tracking.error&&<AppText accessibilityLiveRegion="polite">{t('p8.loading')}</AppText>}
  {tracking.ready&&<>
   <GlassCard style={s.card}>
    <AppText variant="SectionLabel">{t('p9.week')}</AppText>
    <AppText variant="Caption" style={s.secondary}>{t('p9.range',{start:week.days[0].date,end:week.days[6].date})}</AppText>
    <View style={s.grid}>{(['taken','skipped','pending'] as const).map(status=><View key={status} style={s.progressStat}><AppText variant="DashboardTitle" style={s.accent}>{week[status]}</AppText><AppText variant="Caption">{t(`p8.${status}`)}</AppText></View>)}</View>
    <AppText variant="Title">{week.percent===null?t('p9.noData'):t('p9.completion',{percent:week.percent})}</AppText>
    <AppText variant="Caption" style={s.secondary}>{t('p9.denominator',{taken:week.taken,total:week.total,days:week.coveredDays})}</AppText>
    <AppText variant="Caption" style={s.secondary}>{t('p9.partial')}</AppText>
   </GlassCard>
   <View style={s.compactStack}>{week.days.map(day=>{
    const label=day.day.toLocaleDateString(i18n.language,{weekday:'short',month:'short',day:'numeric'}),value=day.percent===null?t('p9.noData'):t('p9.ratio',{taken:day.taken,total:day.total});
    return <Pressable key={day.date} testID={`progress-day-${day.date}`} accessibilityRole="button" accessibilityLabel={label+', '+value} accessibilityState={{selected:chosen.date===day.date}} style={[s.chartDay,chosen.date===day.date&&s.chartSelected]} onPress={()=>setSelected(day.date)}>
     <View style={s.eyebrow}><AppText variant="Caption">{label}</AppText><AppText variant="Caption" style={s.accent}>{value}</AppText></View>
     <View accessible={false} style={s.progressTrack}><View style={[s.progressFill,{flex:(day.percent??0)/100}]}/></View>
    </Pressable>;
   })}</View>
   <AppText variant="Title" accessibilityRole="header">{chosen.date}</AppText>
   <AppText variant="Caption" style={s.secondary}>{t('p9.breakdown')}</AppText>
   {chosen.total===0?<AppText>{t('p9.noData')}</AppText>:chosen.doses.map(dose=><HistoryDoseCard key={dose.key} dose={dose} busy={tracking.busy} onChange={tracking.change}/>)}
  </>}
  <TextButton label={t('p2.refresh')} onPress={()=>{setRevision(value=>value+1);tracking.retry();}}/>
  <Pressable accessibilityRole="button" accessibilityLabel={t('p9.about')} accessibilityState={{expanded:info}} style={s.summaryAction} onPress={()=>setInfo(value=>!value)}><AppText variant="Caption" style={s.accent}>{t('p9.about')}</AppText></Pressable>
  {info&&<AppText variant="Caption" style={s.secondary}>{t('p9.explanation')}</AppText>}
 </Screen>;
}
