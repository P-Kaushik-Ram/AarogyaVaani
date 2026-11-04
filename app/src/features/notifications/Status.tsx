import React from 'react';
import { BellIcon } from 'phosphor-react-native/src/icons/Bell';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { Pressable,View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../../components/ui/Button';
import { AppText } from '../../components/ui/Text';
import { GlassCard } from '../../components/ui/Glass';
import { useTheme } from '../../design/ThemeProvider';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNotificationHealth } from './service';
import { stitch,stitchStyles } from '../../design/stitch';
export function NotificationStatus({settingsLink=true,compact=false}:{settingsLink?:boolean;compact?:boolean}){
  const {t,i18n}=useTranslation(),health=useNotificationHealth(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth);
  const tone=health.status==='scheduled'?'success':health.status==='error'||health.status==='denied'?'danger':'accent';
  const Glyph=health.status==='scheduled'?BellIcon:WarningCircleIcon;
  if(compact)return <GlassCard testID="notification-summary" accessibilityLiveRegion="polite" style={s.summary}>
   {!!health.unconfirmedSnoozes&&<AppText accessibilityRole="alert">{t('p12.unconfirmedSnooze')}</AppText>}
   <View style={s.summaryRow}>
    <Glyph size={stitch.icon} color={colors[tone]}/>
    <View style={s.wrapLabel}><AppText variant="Caption" style={s.secondary}>{t('p42.deviceAlerts')}</AppText><AppText variant="Caption" style={{color:colors[tone]}}>{t(`p4.${health.status}Label`)}</AppText></View>
    {settingsLink&&<Pressable accessibilityRole="button" accessibilityLabel={t('settings.health')} style={s.summaryAction} onPress={()=>router.push('/settings/notification-health')}><AppText variant="Caption" style={s.accent}>{t('settings.health')}</AppText></Pressable>}
   </View>
   {(health.status==='denied'||health.status==='error')&&<AppText variant="Caption" style={{color:colors.danger}}>{t(`p3.${health.status}`)}</AppText>}
   {health.status==='scheduled'&&<AppText variant="Caption" style={s.secondary}>{t('p4.refill')}</AppText>}
   {health.offline&&<AppText variant="Caption" style={s.secondary}>{t('p3.offline')}</AppText>}
  </GlassCard>;
  return <GlassCard accessibilityLiveRegion="polite">
   {!!health.unconfirmedSnoozes&&<AppText accessibilityRole="alert">{t('p12.unconfirmedSnooze')}</AppText>}
   <StatusBadge icon={Glyph} tone={tone} label={t(`p4.${health.status}Label`)}/>
   <AppText variant="Caption" style={{color:colors.textSecondary}}>{t(`p3.${health.status}`,{count:health.count,until:health.until?new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium'}).format(health.until):''})}</AppText>
   {health.status==='scheduled'&&<AppText variant="Caption" style={{color:colors.textSecondary}}>{t('p4.refill')}</AppText>}
   {health.offline&&<AppText variant="Caption">{t('p3.offline')}</AppText>}
   {settingsLink&&<TextButton label={t('settings.health')} onPress={()=>router.push('/settings/notification-health')}/>}
  </GlassCard>;
}
