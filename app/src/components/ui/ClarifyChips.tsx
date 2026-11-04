import React from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from './Text';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export function ClarifyChips({options,onSelect,selected}:{options:{value:string;label:string}[];onSelect:(value:string)=>void;selected?:string}) {const {colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth);return <View style={s.row}>{options.map(o=><Pressable key={o.value} accessibilityRole="button" accessibilityLabel={o.label} accessibilityState={{selected:selected===o.value}} onPress={()=>onSelect(o.value)} style={[s.chip,selected===o.value&&s.selected]}><AppText>{o.label}</AppText></Pressable>)}</View>;}
