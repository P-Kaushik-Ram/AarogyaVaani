import React from 'react';
import { View, Pressable } from 'react-native';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { MinusIcon } from 'phosphor-react-native/src/icons/Minus';
import { useTranslation } from 'react-i18next';
import { AppText } from './Text';
import { SecondaryButton } from './Button';
import { ClarifyChips } from './ClarifyChips';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function TimeStepper({value,onChange}:{value:{hour:number;minute:number};onChange:(v:{hour:number;minute:number})=>void}){
 const {t}=useTranslation(),{colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth);
 function unit(which:'hour'|'minute',delta:number){onChange({...value,[which]:(value[which]+delta+(which==='hour'?24:60))%(which==='hour'?24:60)});}
 return <View style={s.stack}><AppText variant="H2">{t('time.display',{hour:String(value.hour%12||12),minute:String(value.minute).padStart(2,'0'),period:t(value.hour<12?'time.am':'time.pm')})}</AppText><View style={s.row}>{(['hour','minute'] as const).map(which=><View key={which} style={s.stepperUnit}><AppText>{t(`time.${which}`)}</AppText>{([-1,1] as const).map(delta=>{const Glyph=delta<0?MinusIcon:PlusIcon;const label=t(delta<0?'time.decrease':'time.increase',{unit:t(`time.${which}`)});return <Pressable key={delta} accessibilityRole="button" accessibilityLabel={label} onPress={()=>unit(which,delta)} style={[s.button,s.secondary]}><Glyph size={metrics.size.icon} color={colors.accent} weight="bold"/><AppText variant="Caption">{label}</AppText></Pressable>;})}</View>)}</View><SecondaryButton label={t(value.hour<12?'time.am':'time.pm')} onPress={()=>onChange({...value,hour:(value.hour+12)%24})}/><ClarifyChips options={(['morning','afternoon','evening','night'] as const).map((name,i)=>({value:String([8,13,18,21][i]),label:t(`time.${name}`)}))} onSelect={h=>onChange({hour:Number(h),minute:0})}/></View>;
}
