import React from 'react';
import { View } from 'react-native';
import { StethoscopeIcon } from 'phosphor-react-native/src/icons/Stethoscope';
import { useTranslation } from 'react-i18next';
import { AppText } from '../ui/Text';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function CareNote({language}:{language?:string}={}){const {colors}=useTheme(),s=createStyles(colors),{t}=useTranslation(undefined,{lng:language});return <View style={[s.surface,s.care]}><StethoscopeIcon color={colors.care} size={metrics.size.icon} weight="bold"/><AppText variant="Title" accessibilityRole="header" style={{color:colors.care}}>{t('care.title')}</AppText><AppText>{t('care.body')}</AppText></View>;}
