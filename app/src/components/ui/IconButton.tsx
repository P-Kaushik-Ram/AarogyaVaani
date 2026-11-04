import React from 'react';
import { Pressable, View } from 'react-native';
import type { Icon } from 'phosphor-react-native';
import { AppText } from './Text';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function IconButton({icon:Glyph,label,onPress,compact=false}:{icon:Icon;label:string;onPress:()=>void;compact?:boolean}) {const {colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth);return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.iconButton}><View style={[s.iconCircle,compact&&s.iconCompact]}><Glyph size={compact?metrics.size.iconSmall:metrics.size.icon} weight="regular" color={colors.textPrimary}/></View>{!compact&&<AppText variant="Caption">{label}</AppText>}</Pressable>;}
