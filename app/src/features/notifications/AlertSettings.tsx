import React from 'react';
import { Switch,View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '../../components/ui/Text';
import { GlassCard } from '../../components/ui/Glass';
import { usePreferences } from '../../store/preferences';
import { stitchStyles } from '../../design/stitch';
import { useTheme } from '../../design/ThemeProvider';
import { fullScreenCapability } from './capabilities';

export function AlertSettings(){
 const p=usePreferences(),{t}=useTranslation(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth),capability=fullScreenCapability();
 return <GlassCard style={s.card}>
  <AppText variant="Title">{t('p12.settings')}</AppText>
  <AppText>{t('p12.headsUp')}</AppText>
  <View style={s.eyebrow}><AppText>{t('p12.sound')}</AppText><Switch accessibilityLabel={t('p12.sound')} value={p.reminderSound} onValueChange={reminderSound=>p.patch({reminderSound})}/></View>
  <View style={s.eyebrow}><AppText>{t('p12.vibration')}</AppText><Switch accessibilityLabel={t('p12.vibration')} value={p.reminderVibration} onValueChange={reminderVibration=>p.patch({reminderVibration})}/></View>
  <AppText variant="Caption">{t('p12.soundHint')}</AppText>
  <View style={s.eyebrow}><AppText>{t('p12.fullScreen')}</AppText><Switch accessibilityLabel={t('p12.fullScreen')} accessibilityHint={t(capability.reason)} disabled value={false}/></View>
  <AppText>{t('p12.fullScreenExplain')}</AppText>
  <AppText variant="Caption">{t(capability.reason)}</AppText>
 </GlassCard>;
}
