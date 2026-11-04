import React,{useEffect} from 'react';
import Animated,{useSharedValue,useAnimatedStyle,withRepeat,withTiming,cancelAnimation} from 'react-native-reanimated';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { ExclamationMarkIcon } from 'phosphor-react-native/src/icons/ExclamationMark';
import { MinusIcon } from 'phosphor-react-native/src/icons/Minus';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
import type { DoseState } from './DoseTimeline';
export function DoseNode({status}:{status:DoseState}){
 const {colors,reduceMotion}=useTheme(),s=createStyles(colors),pulse=useSharedValue(metrics.scale.rest);
 useEffect(()=>{cancelAnimation(pulse);pulse.value=metrics.scale.rest;if(status==='due'&&!reduceMotion)pulse.value=withRepeat(withTiming(metrics.scale.breathe,{duration:metrics.motion.due/2}),-1,true);return()=>cancelAnimation(pulse);},[status,reduceMotion,pulse]);
 const animated=useAnimatedStyle(()=>({transform:[{scale:pulse.value}]}));
 const color=status==='taken'?colors.success:status==='missed'?colors.danger:status==='due'?colors.accent:colors.borderStrong;
 const Glyph=status==='taken'?CheckIcon:status==='missed'?ExclamationMarkIcon:status==='skipped'?MinusIcon:status==='due'?ClockIcon:null;
 const filled=status==='taken'||status==='due';
 return <Animated.View accessible={false} style={[s.node,{borderColor:color,backgroundColor:filled?color:colors.bg},animated]}>{Glyph&&<Glyph size={metrics.space.screen} color={filled?colors.onAccent:color} weight="bold"/>}</Animated.View>;
}
