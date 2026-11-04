import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '../ui/Glass';
import { AppText } from '../ui/Text';
import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { useTheme } from '../../design/ThemeProvider';
import { stitch,stitchStyles } from '../../design/stitch';
import { DeviceAlertState } from './TodayReminderCard';
import { nextMedicine } from '../../features/reminders/presentation';
import { recurrence } from '../../features/reminders/data';

export function NextMedicineCard({next}:{next:NonNullable<ReturnType<typeof nextMedicine>>}){
 const {t,i18n}=useTranslation(),{colors,borderWidth,theme}=useTheme(),s=stitchStyles(colors,borderWidth);
 const date=new Intl.DateTimeFormat(i18n.language,{timeZone:next.timezone,weekday:'short',day:'numeric',month:'short'}).format(next.at);
 return <GlassCard highlight={theme!=='hc'} style={s.card} testID="next-medicine">
  <View style={s.eyebrow}>
   <View style={s.label}><View style={s.dot}/><AppText variant="SectionLabel" style={s.accent}>{t('p4.nextMedicine')}</AppText></View>
   <View style={s.tag}><AppText variant="Caption" style={s.accent}>{t('p42.upcoming')}</AppText></View>
  </View>
  <View style={s.nextIdentity}><AppText variant="DashboardTitle" style={s.nextName}>{next.medicine}</AppText><AppText variant="TimeDisplay" style={s.nextTime}>{next.time}</AppText></View>
  <View style={s.nextIdentity}><View style={s.label}><ArrowsClockwiseIcon size={stitch.detailIcon} color={colors.accent}/><AppText variant="Caption" style={s.secondary}>{recurrence(next.reminder.days_of_week,t)}</AppText></View><AppText variant="Caption" style={s.secondary}>{date}</AppText></View>
  <View style={s.divider}><DeviceAlertState concise/></View>
 </GlassCard>;
}
