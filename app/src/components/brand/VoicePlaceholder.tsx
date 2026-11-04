import React, { useId,useEffect,useState } from 'react';
import { Animated,Easing,Pressable,View } from 'react-native';
import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import Svg, { Defs,RadialGradient,Stop,Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { AppText } from '../ui/Text';
import { metrics } from '../../design';
import { art } from '../../design/artwork';
import { useTheme } from '../../design/ThemeProvider';
import { stitch,stitchStyles } from '../../design/stitch';

// Listening follows native readiness; starting also covers the TTS handoff.
export function VoicePlaceholder({label,caption,actionLabel,prominent=false,onPress,disabled=true,listening=false,starting=false,processing=false}:{label?:string;caption?:string;actionLabel?:string;prominent?:boolean;onPress?:()=>void;disabled?:boolean;listening?:boolean;starting?:boolean;processing?:boolean}={}){
 const {t}=useTranslation(),{colors,borderWidth,theme,reduceMotion}=useTheme(),s=stitchStyles(colors,borderWidth),id=useId();
 const [pulse]=useState(()=>new Animated.Value(1)),[progress]=useState(()=>new Animated.Value(0));
 useEffect(()=>{
  pulse.setValue(1);progress.setValue(0);
  let animation:Animated.CompositeAnimation|undefined;
  if(!reduceMotion){
   if(listening)animation=Animated.loop(Animated.sequence([
    Animated.timing(pulse,{toValue:stitch.microphonePulseScale,duration:stitch.microphonePulseMs/2,useNativeDriver:true}),
    Animated.timing(pulse,{toValue:1,duration:stitch.microphonePulseMs/2,useNativeDriver:true}),
   ]));
   else if(processing)animation=Animated.loop(Animated.timing(progress,{toValue:1,duration:stitch.microphoneProgressMs,easing:Easing.linear,useNativeDriver:true}));
  }
  animation?.start();return()=>{animation?.stop();pulse.stopAnimation();progress.stopAnimation();};
 },[listening,processing,reduceMotion,pulse,progress]);
 const ring={transform:[{scale:pulse},{rotate:progress.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']})}]};
 return <View style={s.microphoneArea}>
  <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label??t('p4.voiceSoon')} accessibilityState={{disabled,busy:starting||processing}} style={s.microphoneTarget}>
   {theme!=='hc'&&<View pointerEvents="none" accessible={false} style={{position:'absolute'}}><Svg width={stitch.microphoneGlow} height={stitch.microphoneGlow} viewBox={art.viewBox}><Defs><RadialGradient id={id}><Stop offset="0%" stopColor={colors.amber} stopOpacity={metrics.opacity.glow}/><Stop offset="55%" stopColor={colors.amber} stopOpacity={metrics.opacity.glowLow}/><Stop offset="100%" stopColor={colors.amber} stopOpacity={metrics.space.none}/></RadialGradient></Defs><Circle cx={art.center} cy={art.center} r={art.radius} fill={`url(#${id})`}/></Svg></View>}
   {(listening||processing)&&<Animated.View testID={listening?'microphone-listening-ring':'microphone-processing-ring'} pointerEvents="none" accessible={false} style={[s.microphoneRing,prominent&&s.talkMicrophoneRing,processing&&s.microphoneProgress,ring]}/>}
   <View testID="microphone-core" style={[s.microphoneCore,prominent&&s.talkMicrophoneCore,starting&&s.microphoneStarting,listening&&s.microphoneListening]}><MicrophoneIcon size={metrics.size.iconVisual} color={listening?colors.onAccent:colors.accent}/></View>
  </Pressable>
  {actionLabel&&<AppText variant="Button" style={s.talkCenteredAccent}>{actionLabel}</AppText>}
  {(caption||!actionLabel)&&<AppText variant="Caption" accessibilityLiveRegion="polite" style={s.talkCenteredSecondary}>{caption??t('p4.voiceSoon')}</AppText>}
 </View>;
}
