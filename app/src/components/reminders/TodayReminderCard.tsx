import React from 'react';
import { Pressable, View } from 'react-native';
import { BellIcon } from 'phosphor-react-native/src/icons/Bell';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { AppText } from '../ui/Text';
import { GlassCard } from '../ui/Glass';
import { useTheme } from '../../design/ThemeProvider';
import { stitch,stitchStyles } from '../../design/stitch';
import { LocalReminder } from '../../features/notifications/planner';
import { recurrence,schedule } from '../../features/reminders/data';
import { useNotificationHealth } from '../../features/notifications/service';
import type { Health } from '../../features/notifications/engine';

// Aggregate device readiness, not a delivery receipt for an individual medicine.
function todayStatusKey(health:Health){
 if(health.status==='denied')return 'p6.permissionRequired';
 if(health.status==='scheduled'&&health.count>0&&health.until>Date.now())return 'p6.scheduled';
 return 'p6.needsAttention';
}

// The P3 store is aggregate device health, not a per-reminder delivery receipt.
export function DeviceAlertState({compact=false,concise=false}:{compact?:boolean;concise?:boolean}){
 const {t}=useTranslation(),health=useNotificationHealth(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth);
 if(concise)return <View style={s.label}><BellIcon size={stitch.detailIcon} color={health.status==='error'||health.status==='denied'?colors.danger:colors.accent}/><AppText variant="Caption" style={[s.wrapLabel,health.status==='error'||health.status==='denied'?{color:colors.danger}:s.secondary]}>{t(todayStatusKey(health))}</AppText></View>;
 if(compact)return <View style={s.label}><BellIcon size={stitch.detailIcon} color={health.status==='error'||health.status==='denied'?colors.danger:colors.accent}/><AppText variant="Caption" style={[s.wrapLabel,health.status==='error'||health.status==='denied'?{color:colors.danger}:s.secondary]}>{t('p43.deviceStatus',{status:t(`p4.${health.status}Label`)})}</AppText></View>;
 return <View style={s.label}><BellIcon size={stitch.icon} color={health.status==='error'||health.status==='denied'?colors.danger:colors.accent}/><View style={{flexShrink:1}}>
  <AppText variant="Caption" style={s.secondary}>{t('p42.deviceAlerts')}</AppText>
  <AppText variant="Caption" style={health.status==='error'||health.status==='denied'?{color:colors.danger}:s.accent}>{t(`p4.${health.status}Label`)}</AppText>
 </View></View>;
}

export function TodayReminderCard({reminder,stacked,children,timesInTracking=false}:{reminder:LocalReminder;stacked:boolean;timesInTracking?:boolean;children?:React.ReactNode}){
 const {t}=useTranslation(),health=useNotificationHealth(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth);
 const separateTimes=stacked||reminder.times.length>1;
 return <GlassCard testID={`today-medicine-card-${reminder.id}`} style={s.todayShell}>
  <Pressable testID={`today-reminder-${reminder.id}`} accessibilityRole="button" accessibilityLabel={[reminder.medicine,schedule(reminder,t),t('p42.deviceAlerts'),t(todayStatusKey(health))].join(', ')} onPress={()=>router.push({pathname:'/reminder/[id]',params:{id:reminder.id}})} style={s.todayCard}>
  <View style={[s.tileIcon,s.iconFixed]}><PillIcon size={stitch.icon} color={colors.accent}/></View>
  <View style={s.wrapLabel}>
   <View style={separateTimes?s.todayHeadingStack:s.todayHeading}>
    <AppText variant="Title" style={separateTimes?s.todayName:s.wrapLabel}>{reminder.medicine}</AppText>
    <View style={s.todayTimes}>{!timesInTracking&&reminder.times.map(time=><AppText key={time} variant="DashboardTitle" numberOfLines={1} style={s.accent}>{time}</AppText>)}</View>
   </View>
   <View style={s.label}><ArrowsClockwiseIcon size={stitch.detailIcon} color={colors.textSecondary}/><AppText variant="Caption" style={[s.wrapLabel,s.secondary]}>{recurrence(reminder.days_of_week,t)}</AppText></View>
   <DeviceAlertState concise/>
  </View>
  </Pressable>
  {children}
 </GlassCard>;
}
