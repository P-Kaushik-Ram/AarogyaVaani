import React from 'react';
import { Pressable, View } from 'react-native';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { AppText } from '../ui/Text';
import { MedicineGlyph } from '../brand/Glyphs';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
import { GlassLight } from '../ui/Glass';
export function MedicineRow({medicine,schedule,time,repeat,timezone,status,onPress}:{medicine:string;schedule?:string;time?:string;repeat?:string;timezone?:string;status?:string;onPress:()=>void}){
 const {colors,borderWidth}=useTheme(),s=createStyles(colors,borderWidth);
 return <Pressable accessibilityRole="button" accessibilityLabel={[medicine,schedule,time,repeat,timezone,status].filter(Boolean).join(', ')} onPress={onPress} style={s.medicineRow}>
  <GlassLight/><View style={s.medicineIcon}><MedicineGlyph kind="capsule"/></View>
  <View style={s.shrink}><AppText variant="Title">{medicine}</AppText>
   {time&&<AppText style={{color:colors.accent}}>{time}</AppText>}
   <AppText variant="Caption" style={{color:colors.textSecondary}}>{schedule??repeat}</AppText>
   {!!timezone&&<AppText variant="Caption" style={{color:colors.textSecondary}}>{timezone}</AppText>}
   {!!status&&<AppText variant="Caption">{status}</AppText>}
  </View><CaretRightIcon color={colors.textSecondary} size={metrics.size.icon}/>
 </Pressable>;
}
