import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function Skeleton(){const {colors}=useTheme(),s=createStyles(colors),{t}=useTranslation();return <View accessibilityLabel={t('loading.label')} accessibilityState={{busy:true}} style={s.stack}><View style={s.skeleton}/><View style={s.skeleton}/></View>;}
