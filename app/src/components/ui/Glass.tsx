import React, { useId } from 'react';
import { View, ViewProps } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect } from 'react-native-svg';
import { art } from '../../design/artwork';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
import { stitchStyles } from '../../design/stitch';

export function GlassEdge(){
 const {colors,theme}=useTheme();
 return theme==='hc'?null:<View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={stitchStyles(colors).glassEdge}/>;
}

// SVG's native extractor replaces color alpha with stopOpacity. Always use RGB
// colors plus explicit opacity; rgba stops without it become fully opaque.
export function GlassLight({ambient=false}:{ambient?:boolean}) {
 const {colors,theme}=useTheme(),s=createStyles(colors),id=useId();
 if(theme==='hc')return null;
 return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={s.absolute}>
  <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox={art.viewBox}>
   <Defs>{ambient?<><LinearGradient id={`${id}-depth`} x1="0%" y1="0%" x2="0%" y2="100%"><Stop offset="0%" stopColor={colors.surface1} stopOpacity={metrics.glass.topOpacity}/><Stop offset="100%" stopColor={colors.bg} stopOpacity={metrics.space.none}/></LinearGradient><RadialGradient id={id} cx="100%" cy="0%" rx="90%" ry="80%"><Stop offset="0%" stopColor={colors.amber} stopOpacity={metrics.glass.ambientOpacity}/><Stop offset="100%" stopColor={colors.amber} stopOpacity={metrics.space.none}/></RadialGradient></>:<LinearGradient id={id} x1="0%" y1="0%" x2="80%" y2="100%"><Stop offset="0%" stopColor={colors.surface2} stopOpacity={metrics.glass.topOpacity}/><Stop offset="55%" stopColor={colors.surface1} stopOpacity={metrics.glass.middleOpacity}/><Stop offset="100%" stopColor={colors.surface2} stopOpacity={metrics.glass.bottomOpacity}/></LinearGradient>}</Defs>
   {ambient&&<Rect width="100" height="100" fill={`url(#${id}-depth)`}/>}
   <Rect width="100" height="100" fill={`url(#${id})`}/>
  </Svg>
  {!ambient&&<GlassEdge/>}
 </View>;
}
export function GlassCard({children,style,highlight=false,...props}:ViewProps & {highlight?:boolean}) {
 const {colors,borderWidth,theme}=useTheme(),s=createStyles(colors,borderWidth),warm=stitchStyles(colors,borderWidth);
 return <View {...props} style={[s.surface,theme!=='hc'&&warm.glassShadow,highlight&&s.highlight,style]}><GlassLight/>{children}</View>;
}
