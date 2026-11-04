import { voiceDiagnostic } from '../voice/diagnostics';
import { saveConfirmed } from '../notifications/service';
import { NotificationStatus } from '../notifications/Status';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, View,TextInput } from 'react-native';
import { CaretDownIcon } from 'phosphor-react-native/src/icons/CaretDown';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/ui/Screen';
import { AssistantMessage, UserMessage } from '../../components/chat/Messages';
import { TextField } from '../../components/ui/TextField';
import { PrimaryButton, SecondaryButton,TextButton } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/Glass';
import { StitchFoundation,useTheme } from '../../design/ThemeProvider';
import { VoicePlaceholder } from '../../components/brand/VoicePlaceholder';
import { stitch,stitchStyles } from '../../design/stitch';
import { CareNote } from '../../components/chat/CareNote';
import { ConfirmCard } from '../../components/chat/ConfirmCard';
import { ClarifyChips } from '../../components/ui/ClarifyChips';
import { ApiStatus } from '../../components/ui/ApiStatus';
import { Banner } from '../../components/ui/Banner';
import { AppText } from '../../components/ui/Text';
import { usePhaseNotice } from '../../hooks/usePhaseNotice';
import { usePreferences } from '../../store/preferences';
import { getApi, apiAddress } from '../../services/api/session';
import { ApiError } from '../../services/api/client';
import { Analysis, canConfirm, Pack, Reminder } from '../../services/api/models';
import { CancellationAction } from '../reminders/CancellationAction';
import { recurrence,schedule } from '../reminders/data';
import { useVoiceEntry } from '../voice/useVoiceEntry';
import { useKeyboardVisible } from '../../design/useKeyboardVisible';
import { useVoiceFeedback } from '../voice/useVoiceFeedback';
import { analysisResponse,analysisMessage,localizedResponse,LocalizedResponse } from './feedbackText';
import { getLanguage } from '../../../config/languages';

export function TalkScreen(){return <StitchFoundation><TalkContent/></StitchFoundation>;}
function TalkContent(){
 const language=usePreferences(p=>p.language),address=usePreferences(p=>p.serverAddress);
 const {t}=useTranslation(undefined,{lng:language}),params=useLocalSearchParams<{example?:string}>(),cache=useQueryClient(),phase=usePhaseNotice();
 const [text,setText]=useState(params.example??''),[sent,setSent]=useState(''),[analysis,setAnalysis]=useState<Analysis|null>(null),[packs,setPacks]=useState<Pack[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[saved,setSaved]=useState(false),[consumed,setConsumed]=useState(false);
 const [response,setResponse]=useState<LocalizedResponse>();
 const microphoneLock=useRef(false),attempt=useRef(0);
 const [handoff,setHandoff]=useState(false);
 useEffect(()=>()=>{attempt.current++;},[language,address]);
 const lock=useRef(false),generation=useRef(0),[cancelMatches,setCancelMatches]=useState<Reminder[]>([]),[manualName,setManualName]=useState(false);
 const requestContext=useRef({language,address});
 if(requestContext.current.language!==language||requestContext.current.address!==address){generation.current++;requestContext.current={language,address};}
 const {colors,borderWidth}=useTheme(),warm=stitchStyles(colors,borderWidth);
 const keyboard=useKeyboardVisible();
 const [voiceInfoOpen,setVoiceInfoOpen]=useState(false);
 useEffect(()=>{generation.current++;setAnalysis(null);setResponse(undefined);setError(undefined);setSaved(false);setPacks([]);},[language,address]);
 useEffect(()=>()=>{generation.current++;},[]);
 const edit=(value:string)=>{setText(value);setAnalysis(null);setResponse(undefined);setError(undefined);setSaved(false);feedback.cancel();};
 const input=useRef<TextInput>(null);
 const voice=useVoiceEntry({language,scope:address,onBegin:()=>{setAnalysis(null);setResponse(undefined);setError(undefined);setSaved(false);setSent('');setManualName(false);setCancelMatches([]);},onTranscript:edit});
 const feedback=useVoiceFeedback({language,scope:address,busy:voice.busy,isListening:voice.isBusy});
 useEffect(()=>{if(voice.phase==='error'&&!voice.busy)input.current?.focus();},[voice.phase,voice.busy]);
 async function analyze(){
   if(lock.current||microphoneLock.current||voice.isBusy())return;feedback.cancel();voice.reset();Keyboard.dismiss();lock.current=true;setBusy(true);setError(undefined);setAnalysis(null);setResponse(undefined);setSaved(false);setConsumed(false);setManualName(false);const version=generation.current,base=apiAddress(),respond=feedback.forRequest();
   try{
     const api=getApi(base),available=await api.languages();if(version!==generation.current)return;setPacks(available);
     if(!available.some(p=>p.code===language))throw new ApiError('unsupported');
     const result=await api.analyze(text,language);
     const matches=result.intent==='cancel_reminder'&&!result.safety.triggered?(await api.list()).filter(r=>result.matches.some(m=>m.id===r.id)):[];
     if(version===generation.current){setSent(text);setAnalysis(result);setCancelMatches(matches);setManualName(result.missing.includes('medicine'));const message=analysisResponse(result,language);setResponse(message);if(message)respond(message);}
   }catch(e){if(version===generation.current){setError(e);const message=localizedResponse(language,'p11.checkFailed');setResponse(message);respond(message);}}finally{lock.current=false;setBusy(false);}
 }
 async function save(){
   if(lock.current||microphoneLock.current||voice.isBusy()||consumed||!canConfirm(analysis))return;
   feedback.cancel();lock.current=true;setBusy(true);setConsumed(true);setError(undefined);const version=generation.current,base=apiAddress(),respond=feedback.forRequest();
   try{
     const reminder=await saveConfirmed(base,analysis);
     void cache.invalidateQueries({queryKey:['reminders',base]});
     if(version===generation.current){setSaved(true);setAnalysis(null);setText('');setSent(reminder.medicine+' · '+schedule(reminder,t));const message=localizedResponse(language,'p11.saved');setResponse(message);respond(message);}
   }catch(e){
     if(version===generation.current){
       const definite=e instanceof ApiError&&['auth','rate','invalid','config','storage','busy'].includes(e.kind);
       setError(definite?e:new ApiError('uncertain'));const message=localizedResponse(language,definite?'p11.saveFailed':'p11.saveUncertain');setResponse(message);respond(message);if(definite)setConsumed(false);
     }
   }finally{lock.current=false;setBusy(false);}
 }
 const starting=handoff||voice.phase==='checking';
 const safe=analysis&&!analysis.safety.triggered&&analysis.intent!=='out_of_scope';
 return <Screen titleKey="tab.talk" back={false} help settings appearance="stitch" footer={keyboard?<View testID="keyboard-check-action" style={warm.keyboardAction}><PrimaryButton label={t('talk.send')} disabled={busy||voice.busy||!text.trim()} onPress={()=>void analyze()}/></View>:undefined} scrollToEndKey={canConfirm(analysis)?'confirm':saved?'saved':undefined}>
  <GlassCard style={warm.talkWelcome}>
   <AppText variant="H1" accessibilityRole="header" style={warm.accent}>{t('p7.welcome')}</AppText>
   <AppText>{t('p7.subtitle')}</AppText>
   <AppText variant="Caption" style={warm.secondary}>{t('p7.support')}</AppText>
  </GlassCard>
  <View style={warm.compactStack}>
  <Pressable accessibilityRole="button" accessibilityLabel={t('p7.voiceLanguage',{language:getLanguage(language).nativeName})} accessibilityHint={t('settings.language')} onPress={()=>router.push('/settings/language-voice')} style={warm.talkLanguage}>
   <AppText variant="Caption" style={[warm.accent,warm.talkControlText]}>{t('p7.voiceLanguage',{language:getLanguage(language).nativeName})}</AppText>
   <CaretDownIcon size={stitch.detailIcon} color={colors.accent} style={warm.iconFixed}/>
  </Pressable>
  <VoicePlaceholder prominent actionLabel={voice.supported?t(voice.phase==='listening'?'p5.stop':'p7.tap'):undefined} label={voice.supported?t(voice.phase==='listening'?'p5.stop':'p5.tap'):t('p5.language')} starting={starting} caption={starting?t('p134.starting'):!voice.supported?t('p5.language'):voice.phase==='error'?t(`p5.${voice.problem??'error'}`,{language:getLanguage(language).nativeName}):voice.phase==='idle'?undefined:t(`p5.${voice.phase}`,{action:t('talk.send')})} disabled={handoff||busy||!voice.supported||(voice.busy&&voice.phase!=='listening')} listening={voice.phase==='listening'} processing={voice.phase==='processing'} onPress={()=>{if(busy||lock.current||microphoneLock.current)return;Keyboard.dismiss();if(voice.phase==='listening'){voice.stop();return;}microphoneLock.current=true;const tappedAt=Date.now(),current=++attempt.current;setHandoff(true);voiceDiagnostic('mic-tap',{locale:voice.locale,elapsedMs:0});void (async()=>{try{if(await feedback.prepareMicrophone()&&current===attempt.current&&!lock.current){voiceDiagnostic('mic-request',{locale:voice.locale,elapsedMs:Date.now()-tappedAt});await voice.start(tappedAt);}}finally{microphoneLock.current=false;setHandoff(false);}})();}}/>
  <AppText variant="Caption">{t('p13.pattern')}</AppText>
  {(handoff||voice.busy)&&<TextButton label={t('p5.cancel')} onPress={()=>{attempt.current++;feedback.cancel();voice.cancel();}}/>}
  {!!voice.cueProblem&&<AppText variant="Caption" accessibilityLiveRegion="polite">{t(`p112.cue.${voice.cueProblem}`)}</AppText>}
  {voice.localeChecked&&!voice.localeVerified&&['listening','processing','success'].includes(voice.phase)&&<AppText variant="Caption" style={warm.secondary}>{t('p5.localeUnknown',{language:getLanguage(language).nativeName})}</AppText>}
  {!!voice.partial&&<AppText variant="Caption" style={warm.secondary}>{voice.partial}</AppText>}
  {voice.phase==='error'&&voice.problem==='permission'&&<TextButton label={t('p5.settings')} onPress={voice.openSettings}/>}
  <View style={warm.talkPrivacy}>
   <AppText variant="Caption" style={warm.talkCenteredSecondary}>{t('p7.privacySummary')}</AppText>
   <Pressable accessibilityRole="button" accessibilityLabel={t('p7.voiceInfo')} accessibilityState={{expanded:voiceInfoOpen}} onPress={()=>setVoiceInfoOpen(open=>!open)} style={warm.talkDisclosure}>
    <AppText variant="SectionLabel" style={[warm.accent,warm.talkControlText]}>{t('p7.voiceInfo')}</AppText>
    <CaretDownIcon size={stitch.detailIcon} color={colors.accent} style={[warm.iconFixed,voiceInfoOpen&&warm.talkExpanded]}/>
   </Pressable>
   {voiceInfoOpen&&<AppText variant="Caption" style={warm.secondary}>{t('p5.privacy')}</AppText>}
  </View>
  </View>
  <View style={warm.compactStack}>
   <TextField compact inputRef={input} style={warm.input} label={t('talk.input')} placeholder={t('p7.placeholder')} value={text} onChangeText={value=>{voice.reset();edit(value);}} editable={!busy&&!voice.busy} multiline maxLength={300}/>
   <AppText variant="Caption" style={{color:colors.textSecondary}}>{t('p4.typeHint')}</AppText>
   {!keyboard&&<PrimaryButton label={t('talk.send')} disabled={busy||voice.busy||!text.trim()} onPress={()=>void analyze()}/>}
  </View>
  {sent&&<UserMessage text={sent}/>}
  <ApiStatus language={language} loading={busy} error={error} onRetry={error&&!consumed?()=>void analyze():undefined}/>
  {!!response&&<AppText testID="talk-response" variant="Caption" accessibilityLiveRegion="polite">{response.text}</AppText>}
  {!!feedback.problem&&<AppText variant="Caption" accessibilityRole="alert">{t(`p11.${feedback.problem}`,{language:getLanguage(language).nativeName})}</AppText>}
  {feedback.problem&&['language','localVoice'].includes(feedback.problem)&&<AppText variant="Caption">{t('p132.voiceHelp')}</AppText>}
  {analysis&&(!safe?<CareNote language={language}/>:analysis.intent==='unsupported_language'||analysis.detected_language==='unsupported'?<Banner message={t('api.unsupported')}/>:<>
   {!canConfirm(analysis)&&!response&&<AssistantMessage text={analysisMessage(analysis,t,language)}/>}
   {analysis.intent==='add_reminder'&&analysis.draft&&<>
    {!canConfirm(analysis)&&<GlassCard><AppText>{analysis.draft.medicine||t('p2.medicineMissing')}</AppText><AppText>{schedule(analysis.draft,t)}</AppText>{analysis.draft.note&&<AppText>{analysis.draft.note}</AppText>}</GlassCard>}
    {canConfirm(analysis)&&analysis.draft.note&&<AppText>{analysis.draft.note}</AppText>}
    {analysis.missing.map(item=><Banner key={item} message={t(['medicine','time','time_ambiguous','frequency','dosage'].includes(item)?`p2.missing.${item}`:'p2.correct')}/>)}
    {manualName&&<TextField label={t('medicine.name')} value={analysis.draft.medicine??''} maxLength={100} editable={!busy&&!consumed} onChangeText={medicine=>{feedback.cancel();setResponse(undefined);setAnalysis({...analysis,draft:{...analysis.draft!,medicine},missing:medicine.trim()?analysis.missing.filter(m=>m!=='medicine'):[...new Set([...analysis.missing,'medicine'])]});}}/>}
    {analysis.candidates.times&&<ClarifyChips options={analysis.candidates.times.map(value=>({value,label:value}))} onSelect={value=>{if(!busy&&!consumed){feedback.cancel();setResponse(undefined);setAnalysis({...analysis,draft:{...analysis.draft!,times:[value]},missing:analysis.missing.filter(m=>m!=='time_ambiguous'&&m!=='time')});}}}/>}
    {canConfirm(analysis)&&<ConfirmCard language={language} medicine={analysis.draft.medicine!} schedule={schedule(analysis.draft,t)} times={analysis.draft.times!.join(', ')} repeat={recurrence(analysis.draft.days_of_week,t)} onSave={()=>void save()} onChange={()=>{feedback.cancel();setResponse(undefined);setAnalysis(null);}} onRead={phase.show} disabled={busy||voice.busy||consumed}/>}
   </>}
   {analysis.intent==='cancel_reminder'&&cancelMatches.map(r=><CancellationAction key={r.id} reminder={r}/>)}
   {(analysis.intent==='view_reminders'||analysis.intent==='cancel_reminder')&&<AppText>{t('p2.manage')}</AppText>}
  </>)}
  {saved&&<><Banner message={t('reminder.saved')}/><NotificationStatus compact/></>}
  <SecondaryButton label={t('tab.medicines')} onPress={()=>router.push('/medicines')}/>
  {packs.some(p=>p.code===language)&&<AppText>{t('language.draft')}</AppText>}
  {phase.notice}
 </Screen>;
}
