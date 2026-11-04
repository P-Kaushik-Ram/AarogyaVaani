import React from 'react';
import { View } from 'react-native';
import type { Icon } from 'phosphor-react-native';
import { AppText } from './Text';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';

export function StatusBadge({label,icon:Glyph,tone='accent'}:{label:string;icon:Icon;tone?:'success'|'danger'|'accent'}){
 const {colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth);
 return <View style={[s.badge,{borderColor:colors[tone]}]}>
  <Glyph size={metrics.size.icon} color={colors[tone]}/>
  <AppText variant="Caption">{label}</AppText>
 </View>;
}
