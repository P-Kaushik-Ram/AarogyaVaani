import React from 'react';
import { Pressable, View } from 'react-native';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { useTranslation } from 'react-i18next';
import { languages, LanguageCode,voiceInputLocale } from '../../../config/languages';
import { AppText } from './Text';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function LanguageList({value,onChange}:{value:LanguageCode;onChange:(code:LanguageCode)=>void}) {
 const {colors}=useTheme(),s=createStyles(colors),{t}=useTranslation();
 return <View>{languages.map(l=>{
  const voiceLabel=t(voiceInputLocale(l.code)?'p5.unverified':'language.typingOnly');
  return <Pressable key={l.code} accessibilityRole="radio" accessibilityLabel={[l.nativeName,...(!l.readinessUnderstanding?[t('language.beta')]:[]),...(!l.readinessVoice?[voiceLabel]:[])].join(', ')} accessibilityState={{selected:l.code===value,checked:l.code===value}} onPress={()=>onChange(l.code)} style={s.languageRow}><View style={s.rowSpread}><AppText variant="Title" language={l.code}>{l.nativeName}</AppText>{value===l.code&&<CheckIcon size={metrics.size.icon} weight="bold" color={colors.accent}/>}</View>{!l.readinessUnderstanding&&<AppText variant="Caption" style={{color:colors.textSecondary}}>{t('language.beta')}</AppText>}{!l.readinessVoice&&<AppText variant="Caption" style={{color:colors.textSecondary}}>{voiceLabel}</AppText>}</Pressable>;
 })}</View>;
}
