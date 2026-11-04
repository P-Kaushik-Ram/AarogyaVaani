import React from 'react';
import { View } from 'react-native';
import { AppText } from '../ui/Text';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function UserMessage({text}:{text:string}){const {colors}=useTheme(),s=createStyles(colors);return <View style={s.user}><AppText variant="BodyLarge">{text}</AppText></View>;}
export function AssistantMessage({text}:{text:string}){const {colors}=useTheme(),s=createStyles(colors);return <View style={s.assistant}><AppText variant="BodyLarge">{text}</AppText></View>;}
