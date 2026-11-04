import React from 'react';
import { Pressable,View } from 'react-native';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from './Text';
import { useTheme } from '../../design/ThemeProvider';
import { stitch,stitchStyles } from '../../design/stitch';

export function AddReminderButton(){
 const {t}=useTranslation(),{colors,borderWidth}=useTheme(),s=stitchStyles(colors,borderWidth);
 return <Pressable accessibilityRole="button" accessibilityLabel={t('p4.addReminder')} style={s.add} onPress={()=>router.push('/talk')}><View style={s.addFace}><PlusIcon size={stitch.icon} color={colors.onAccent}/><AppText variant="SectionLabel" style={s.addText}>{t('p4.addReminder')}</AppText></View></Pressable>;
}
