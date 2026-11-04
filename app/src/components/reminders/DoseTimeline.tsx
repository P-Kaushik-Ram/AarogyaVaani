import React from 'react';
import { View } from 'react-native';
import { DoseNode } from './DoseNode';
import { useTranslation } from 'react-i18next';
import { AppText } from '../ui/Text';
import { metrics } from '../../design';
import { useTheme } from '../../design/ThemeProvider';
import { createStyles } from '../../design/layout';
export type DoseState='upcoming'|'due'|'taken'|'missed'|'skipped';
export function DoseTimeline({items}:{items:{id:string;medicine:string;time:string;status:DoseState}[]}){const {colors}=useTheme(),s=createStyles(colors),{t}=useTranslation();return <View>{items.map((item,i)=>{return <View key={item.id} style={s.timeline}><View style={s.timelineNode}>{i<items.length-1&&<View style={s.rail}/>}<DoseNode status={item.status}/></View><View style={s.grow}><AppText variant="TimelineTime">{item.time}</AppText><AppText variant="Title">{item.medicine}</AppText><AppText variant="Caption" style={{color:colors.textSecondary}}>{t(`dose.${item.status}`)}</AppText></View></View>;})}</View>;}
