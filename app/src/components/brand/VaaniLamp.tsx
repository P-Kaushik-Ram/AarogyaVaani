import React, { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, { cancelAnimation, useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AppText } from '../ui/Text';
import { LampMark } from './Glyphs';
import { art } from '../../design/artwork';
import { metrics as m } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export type LampState='idle'|'listening'|'thinking'|'speaking'|'error';
export function VaaniLamp({state='idle',large=false,onPress,disabled=false,volume=0}:{state?:LampState;large?:boolean;onPress?:()=>void;disabled?:boolean;volume?:number}) {
 const {colors,reduceMotion}=useTheme(),s=createStyles(colors),{t}=useTranslation(),size=large?m.size.lampTalk:m.size.lampToday;
 const pulse=useSharedValue(m.scale.rest),lastVolume=useRef(0),gradientId=React.useId();
 useEffect(()=>{cancelAnimation(pulse);pulse.value=m.scale.rest;if(!reduceMotion&&state!=='error'&&state!=='listening'){const duration=state==='idle'?m.motion.idle:m.motion.due;pulse.value=withRepeat(withTiming(m.scale.breathe,{duration:duration/2}),-1,true);}return()=>cancelAnimation(pulse);},[state,reduceMotion,pulse]);
 useEffect(()=>{if(state==='listening'&&!reduceMotion&&Date.now()-lastVolume.current>=m.motion.volumeThrottle){lastVolume.current=Date.now();pulse.value=withTiming(m.scale.rest+(m.scale.breathe-m.scale.rest)*Math.max(0,Math.min(1,volume)),{duration:m.motion.volumeThrottle});}},[state,volume,reduceMotion,pulse]);
 const animated=useAnimatedStyle(()=>({transform:[{scale:pulse.value}]}));
 return <Pressable accessibilityRole="button" accessibilityLabel={t(`lamp.${state}`)} accessibilityState={{disabled,busy:state==='thinking'}} disabled={disabled} onPress={onPress} style={s.lampArea}><View style={{width:size,height:size}}>{state!=='error'&&<Animated.View style={[s.lampGlow,{width:size*m.scale.glow,height:size*m.scale.glow,left:-size*(m.scale.glow-m.scale.rest)/2,top:-size*(m.scale.glow-m.scale.rest)/2},animated]}><Svg width={size*m.scale.glow} height={size*m.scale.glow} viewBox={art.viewBox} accessible={false}><Defs><RadialGradient id={gradientId}><Stop offset={art.glowStart} stopColor={colors.accent} stopOpacity={m.opacity.glow}/><Stop offset={art.glowEnd} stopColor={colors.accent} stopOpacity={m.space.none}/></RadialGradient></Defs><Circle cx={art.center} cy={art.center} r={art.radius} fill={`url(#${gradientId})`}/></Svg></Animated.View>}<View style={[s.lampCore,{width:size,height:size,backgroundColor:state==='error'?colors.surface2:colors.accent}]}><LampMark size={m.size.glyph} color={state==='error'?colors.textMuted:colors.onAccent}/></View></View><AppText variant="Button" style={{color:colors.accent}}>{t(`lamp.${state}`)}</AppText></Pressable>;
}
