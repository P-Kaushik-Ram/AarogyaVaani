import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { CalendarCheckIcon } from 'phosphor-react-native/src/icons/CalendarCheck';
import { ChatCircleIcon } from 'phosphor-react-native/src/icons/ChatCircle';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import { SpeakerHighIcon } from 'phosphor-react-native/src/icons/SpeakerHigh';
import { I18nextProvider,useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { LanguageCode,languages } from '../../../config/languages';
import { Screen } from '../../components/ui/Screen';
import { AppText } from '../../components/ui/Text';
import { PrimaryButton,SecondaryButton,DestructiveButton,TextButton } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Banner } from '../../components/ui/Banner';
import { Skeleton } from '../../components/ui/Skeleton';
import { Sheet } from '../../components/ui/Sheet';
import { ClarifyChips } from '../../components/ui/ClarifyChips';
import { LanguageList } from '../../components/ui/LanguageList';
import { TimeStepper } from '../../components/ui/TimeStepper';
import { TextField } from '../../components/ui/TextField';
import { BottomTabBar,TabButton } from '../../components/ui/BottomTabBar';
import { VaaniLamp,LampState } from '../../components/brand/VaaniLamp';
import { MedicineGlyph,TimeGlyph,EmptyIllustration } from '../../components/brand/Glyphs';
import { art } from '../../design/artwork';
import { MedicineRow } from '../../components/reminders/MedicineRow';
import { DoseTimeline,DoseState } from '../../components/reminders/DoseTimeline';
import { UserMessage,AssistantMessage } from '../../components/chat/Messages';
import { ConfirmCard } from '../../components/chat/ConfirmCard';
import { CareNote } from '../../components/chat/CareNote';
import { ThemeProvider,useTheme } from '../../design/ThemeProvider';
import { TextSize,ThemeName } from '../../design';
import { createStyles } from '../../design/layout';
export function Gallery(){
 const [language,setLanguage]=useState<LanguageCode>('en'),[size,setSize]=useState<TextSize>('standard'),[theme,setTheme]=useState<ThemeName>('dark');
 const instance=useMemo(()=>i18n.cloneInstance({lng:language,initAsync:false}),[language]);
 return <I18nextProvider i18n={instance}><ThemeProvider theme={theme} textSize={size}><GalleryContents language={language} setLanguage={setLanguage} size={size} setSize={setSize} theme={theme} setTheme={setTheme}/></ThemeProvider></I18nextProvider>;
}
function GalleryContents({language,setLanguage,size,setSize,theme,setTheme}:{language:LanguageCode;setLanguage:(v:LanguageCode)=>void;size:TextSize;setSize:(v:TextSize)=>void;theme:ThemeName;setTheme:(v:ThemeName)=>void}){
 const {t}=useTranslation(),{colors}=useTheme(),s=createStyles(colors),[sheet,setSheet]=useState(false),[lamp,setLamp]=useState<LampState>('idle'),[text,setText]=useState(''),[time,setTime]=useState({hour:20,minute:0});
 const show=()=>setSheet(true),medicine=t('gallery.sampleMedicine'),schedule=t('time.display',{hour:'8',minute:'00',period:t('time.pm')});
 return <Screen titleKey="gallery.title"><Banner message={t('phase.notice')}/><LanguageList value={language} onChange={setLanguage}/><ClarifyChips selected={size} options={(['standard','large','extraLarge'] as const).map(v=>({value:v,label:t(`settings.${v}`)}))} onSelect={v=>setSize(v as TextSize)}/><ClarifyChips selected={theme} options={(['dark','hc'] as const).map(v=>({value:v,label:t(`settings.${v}`)}))} onSelect={v=>setTheme(v as ThemeName)}/><AppText variant="H2">{t('gallery.components')}</AppText><AppText>{t('gallery.long')}</AppText><PrimaryButton label={t('action.save')} onPress={show}/><PrimaryButton label={t('action.save')} disabled onPress={show}/><SecondaryButton label={t('action.change')} onPress={show}/><DestructiveButton label={t('action.delete')} title={t('medicine.deleteTitle',{medicine})} body={t('medicine.deleteBody')} onConfirm={show}/><TextButton label={t('action.read')} onPress={show}/><IconButton label={t('action.read')} icon={SpeakerHighIcon} onPress={show}/><VaaniLamp state={lamp} large volume={0.8} onPress={()=>setLamp(lamp==='listening'?'idle':'listening')}/><ClarifyChips selected={lamp} options={(['idle','listening','thinking','speaking','error'] as const).map(v=>({value:v,label:t(`lamp.${v}`)}))} onSelect={v=>setLamp(v as LampState)}/><MedicineRow medicine={medicine} schedule={schedule} onPress={show}/><DoseTimeline items={(['upcoming','due','taken','missed','skipped'] as DoseState[]).map(status=>({id:status,medicine,time:schedule,status}))}/><UserMessage text={t('talk.example')}/><AssistantMessage text={t('talk.prompt')}/><ConfirmCard medicine={medicine} schedule={t('medicine.daily')} onSave={show} onChange={show} onRead={show}/><CareNote/><ClarifyChips options={[{value:'am',label:t('time.morning')},{value:'pm',label:t('time.night')}]} onSelect={show}/><TextField label={t('medicine.note')} value={text} onChangeText={setText} multiline/><TimeStepper value={time} onChange={setTime}/><Banner message={t('offline.banner')} action={t('action.retry')} onPress={show}/><Banner message={t('error.server')} action={t('action.retry')} onPress={show}/><Banner message={t('reminder.saved')}/><Skeleton/><View style={s.row}>{(Object.keys(art.medicine) as (keyof typeof art.medicine)[]).map(kind=><MedicineGlyph key={kind} kind={kind}/>)}</View><View style={s.row}>{(Object.keys(art.time) as (keyof typeof art.time)[]).map(kind=><TimeGlyph key={kind} kind={kind}/>)}</View><View style={s.row}><EmptyIllustration/><EmptyIllustration kind="medicines"/><EmptyIllustration kind="offline"/></View><BottomTabBar><TabButton label={t('tab.today')} icon={CalendarCheckIcon} isFocused onPress={show}/><TabButton label={t('tab.talk')} icon={ChatCircleIcon} onPress={show}/><TabButton label={t('tab.medicines')} icon={PillIcon} onPress={show}/></BottomTabBar>{languages.map(l=><View key={l.code} style={s.section}>{(['standard','large','extraLarge'] as const).map(textSize=><ThemeProvider key={textSize} textSize={textSize}><AppText variant="Title" language={l.code}>{l.nativeName}</AppText><AppText variant="Caption">{t(`settings.${textSize}`)}</AppText><AppText language={l.code}>{t('gallery.long',{lng:l.code})}</AppText></ThemeProvider>)}</View>)}<Sheet visible={sheet} title={t('reminder.confirm')} onClose={()=>setSheet(false)}><AppText>{t('phase.unavailable')}</AppText><PrimaryButton label={t('action.close')} onPress={()=>setSheet(false)}/></Sheet></Screen>;
}
