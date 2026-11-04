import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '../ui/Text';
import { PrimaryButton,SecondaryButton } from '../ui/Button';
import { GlassCard } from '../ui/Glass';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { stitch,stitchStyles } from '../../design/stitch';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function ConfirmCard({medicine,schedule,times,repeat,onSave,onChange,disabled=false,language}:{language?:string;medicine:string;schedule:string;times?:string;repeat?:string;onSave:()=>void;onChange:()=>void;onRead?:()=>void;disabled?:boolean}){
 const {colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth),warm=stitchStyles(colors,borderWidth),{t}=useTranslation(undefined,{lng:language});
 return <GlassCard testID="confirmation-card" style={warm.confirmation}>
  <AppText variant="SectionLabel">{t('reminder.confirm')}</AppText>
  <View style={warm.confirmRow}><PillIcon size={stitch.icon} color={colors.accent}/><View style={s.shrink}><AppText variant="Caption" style={warm.secondary}>{t('medicine.name')}</AppText><AppText variant="SectionLabel">{medicine}</AppText></View></View>
  {times?<><View style={warm.confirmRow}><ClockIcon size={stitch.icon} color={colors.accent}/><AppText variant="Caption" style={s.shrink}>{t('p42.time')}{': '}{times}</AppText></View><View style={warm.confirmRow}><ArrowsClockwiseIcon size={stitch.icon} color={colors.accent}/><AppText variant="Caption" style={s.shrink}>{t('medicine.repeat')}{': '}{repeat}</AppText></View></>:<AppText variant="Caption">{schedule}</AppText>}
  <View style={s.actions}><View style={s.actionCell}><PrimaryButton label={t('action.save')} disabled={disabled} onPress={onSave}/></View><View style={s.actionCell}><SecondaryButton label={t('action.change')} disabled={disabled} onPress={onChange}/></View></View>
 </GlassCard>;
}
