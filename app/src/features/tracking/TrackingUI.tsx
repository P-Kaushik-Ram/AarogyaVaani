import React,{useCallback,useState} from 'react';
import { Pressable,View,useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router,useFocusEffect } from 'expo-router';
import { AppText } from '../../components/ui/Text';
import { GlassCard } from '../../components/ui/Glass';
import { TextButton,SecondaryButton } from '../../components/ui/Button';
import { Screen } from '../../components/ui/Screen';
import { StitchFoundation,useTheme } from '../../design/ThemeProvider';
import { stitch,stitchStyles } from '../../design/stitch';
import { Dose,DoseStatus,calendarDate,progress } from './doses';
import { useLocalDay } from './useLocalDay';
import { useTracking } from './useTracking';

export function DoseControls({dose,disabled,onChange,showTime=true}:{dose:Dose;disabled:boolean;onChange:(dose:Dose,status:DoseStatus)=>unknown;showTime?:boolean}){
 const {t}=useTranslation(),{colors,borderWidth,textSize}=useTheme(),s=stitchStyles(colors,borderWidth),{width,fontScale}=useWindowDimensions();
 const stacked=width<stitch.columnBreakpoint||fontScale>1||textSize!=='standard';
 const label=t('p8.doseLabel',{medicine:dose.medicine,time:dose.time,date:dose.date,timezone:dose.timezone});
 const action=(key:string,status:DoseStatus,accessibilityKey:string)=><Pressable key={key} accessibilityRole="button" accessibilityLabel={t(accessibilityKey,{dose:label})} accessibilityState={{disabled}} disabled={disabled} style={[s.doseAction,!stacked&&s.doseActionInline]} onPress={()=>onChange(dose,status)}><AppText variant="Button" style={s.doseActionText}>{t(key)}</AppText></Pressable>;
 return <View testID={`dose-controls-${dose.key}`} style={s.doseBlock}>
  {showTime&&<AppText variant="Caption" numberOfLines={1} style={s.doseTime}>{dose.time}</AppText>}
  <View style={s.doseRow}><AppText testID={`dose-status-${dose.key}`} variant="Caption" accessibilityLiveRegion="polite" style={s.doseState}>{dose.status==='taken'?`${t('p8.checked')} `:''}{t(`p8.${dose.status}`)}</AppText>
  <View testID={`dose-actions-${dose.key}`} style={[s.doseActions,stacked&&s.doseActionsStack]}>
   {dose.status==='pending'?<>{action('p8.taken','taken','p81.takeLabel')}{action('p8.skip','skipped','p8.skipLabel')}</>:action('p81.undo','pending',dose.status==='taken'?'p81.undoTakenLabel':'p8.undoSkipLabel')}
  </View></View>
  {dose.recordedAt&&Date.parse(dose.recordedAt)<dose.at&&<AppText variant="Caption" style={s.secondary}>{t('p82.early',{timestamp:new Date(dose.recordedAt).toLocaleString()})}</AppText>}
 </View>;
}
export function DailyProgress({doses,ready,failed=false}:{doses:Dose[];ready:boolean;failed?:boolean}){
 const {t}=useTranslation(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth),p=progress(doses);
 return <GlassCard style={s.card}>
  <AppText variant="SectionLabel" accessibilityRole="header">{t('p8.progress')}</AppText>
  {ready?<><AppText accessibilityLiveRegion="polite">{t('p8.count',p)}</AppText>
  <View accessibilityRole="progressbar" accessibilityLabel={t('p8.progress')} accessibilityValue={{min:0,max:100,now:p.percent,text:t('p8.count',p)}} style={s.progressTrack}><View style={[s.progressFill,{flex:p.percent/100}]}/></View>
  <AppText variant="Caption" style={s.secondary}>{t('p8.percent',{percent:p.percent})}</AppText></>:<AppText variant="Caption">{t(failed?'p8.error':'p8.loading')}</AppText>}
  <AppText variant="Caption" style={s.secondary}>{t('p8.local')}</AppText>
  <TextButton label={t('p9.title')} onPress={()=>router.push('/progress')}/>
  <TextButton label={t('p8.history')} onPress={()=>router.push('/history')}/>
 </GlassCard>;
}
const empty:Dose[]=[];
export function HistoryScreen(){return <StitchFoundation><History/></StitchFoundation>;}
function History(){
 const {t}=useTranslation(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth);
 const clock=useLocalDay(),[offset,setOffset]=useState(0),[info,setInfo]=useState(false),[revision,setRevision]=useState(0),tracking=useTracking(empty,clock.key+'|'+revision);
 useFocusEffect(useCallback(()=>{setRevision(value=>value+1);},[]));
 const day=new Date(clock.now.getFullYear(),clock.now.getMonth(),clock.now.getDate()+offset);
 const selected=calendarDate(day),rows=tracking.rows.filter(dose=>calendarDate(new Date(dose.at))===selected).sort((a,b)=>a.at-b.at);
 function move(offset:number){setOffset(value=>value+offset);}
 return <Screen titleKey="p8.history" appearance="stitch">
  <TextButton label={t('p9.title')} onPress={()=>router.push('/progress')}/>
  <TextButton label={t('p9.about')} onPress={()=>setInfo(value=>!value)}/>
  {info&&<AppText variant="Caption" style={s.secondary}>{t('p8.historyNote')}</AppText>}<AppText variant="H2" accessibilityRole="header">{selected}</AppText>
  <View style={s.historyNavigation}><TextButton label={t('p8.previous')} onPress={()=>move(-1)}/><TextButton label={t('p8.next')} disabled={selected>=calendarDate(new Date())} onPress={()=>move(1)}/></View>
  {tracking.error&&<AppText accessibilityRole="alert">{t('p8.error')}</AppText>}
  {!tracking.ready&&!tracking.error&&<AppText>{t('p8.loading')}</AppText>}
  {tracking.ready&&rows.length===0&&<AppText>{t('p8.noHistory')}</AppText>}
  {rows.map(dose=><HistoryDoseCard key={dose.key} dose={dose} busy={tracking.busy} onChange={tracking.change}/>)}
  <SecondaryButton label={t('p2.refresh')} onPress={()=>setRevision(value=>value+1)}/>
 </Screen>;
}

export function HistoryDoseCard({dose,busy,onChange}:{dose:Dose;busy:boolean;onChange:(dose:Dose,status:DoseStatus)=>unknown}){
 const {t}=useTranslation(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth);
 return <GlassCard testID={`history-dose-${dose.key}`} style={[s.card,s.historyCard]}>
  <View style={s.historyIdentity}><AppText variant="Title" style={[s.historyText,s.historyName]}>{dose.medicine}</AppText><AppText variant="DashboardTitle" numberOfLines={1} style={s.doseTime}>{dose.time}</AppText></View>
  <AppText variant="Caption" style={s.historyText}>{dose.date}{' · '}{dose.timezone}</AppText>
  {dose.recordedAt&&<AppText variant="Caption" style={s.historyText}>{t('p8.recorded',{timestamp:new Date(dose.recordedAt).toLocaleString()})}</AppText>}
  <DoseControls dose={dose} disabled={busy} onChange={onChange} showTime={false}/>
 </GlassCard>;
}
