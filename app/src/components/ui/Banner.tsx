import React from 'react';
import { View } from 'react-native';
import { AppText } from './Text';
import { TextButton } from './Button';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function Banner({message,action,onPress,alert=false}:{message:string;action?:string;onPress?:()=>void;alert?:boolean}) {const {colors}=useTheme(),s=createStyles(colors);return <View style={s.banner} accessibilityLiveRegion="polite"><AppText accessibilityRole={alert?'alert':undefined}>{message}</AppText>{action&&onPress&&<TextButton label={action} onPress={onPress}/>}</View>;}
