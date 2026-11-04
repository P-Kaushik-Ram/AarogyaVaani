import i18n,{ resources } from '../../i18n';
import { getLanguage } from '../../../config/languages';
import { TFunction } from 'i18next';
import { Analysis,canConfirm } from '../../services/api/models';
import { recurrence } from '../reminders/data';

export function analysisFeedback(analysis:Analysis,t:TFunction):string|undefined {
 if(analysis.safety.triggered||analysis.intent!=='add_reminder')return undefined;
 if(!canConfirm(analysis))return t(analysis.missing.some(value=>value==='time'||value==='time_ambiguous')?'p11.missingTime':'p11.clarify');
 return t('p11.confirm',{medicine:analysis.draft.medicine,times:analysis.draft.times.join(', '),repeat:recurrence(analysis.draft.days_of_week,t)});
}

// Older servers may reply in the detected text language rather than the UI
// language. Never render that mismatched prose as a selected-language response.
export function analysisMessage(analysis:Analysis,t:TFunction,language:string):string {
 if(analysis.reply.language===language)return analysis.reply.text;
 if(analysis.intent==='add_reminder')return analysisFeedback(analysis,t)??t('p11.clarify');
 if(analysis.intent==='view_reminders'||analysis.intent==='cancel_reminder')return t('p2.manage');
 if(analysis.intent==='unsupported_language')return t('api.unsupported');
 return t('help.body');
}

export type LocalizedResponse={text:string;language:string;speakable:boolean};
export type ResponseKey='p11.confirm'|'p11.missingTime'|'p11.clarify'|'p11.saved'|'p11.saveFailed'|'p11.saveUncertain'|'p11.checkFailed';
// Validate the static template, before inserting medicine names (which can be in
// any script). Never infer the response language from personal content or allow
// i18next's English fallback to become selected-language speech.
export function localizedResponse(language:string,key:ResponseKey,values:Record<string,string>={}):LocalizedResponse {
 const selected=getLanguage(language);
 const catalog=resources[language as keyof typeof resources]?.translation;
 const template=catalog?.[key];
 const english=resources.en.translation[key];
 const speakable=selected.code===language&&typeof template==='string'&&!!template.trim()&&
  (language==='en'||(template!==english&&[...template.replace(/{{.*?}}/g,'')].some(char=>{
   const point=char.codePointAt(0)!;return point>=selected.unicodeRange[0]&&point<=selected.unicodeRange[1];
  })));
 const text=speakable?i18n.getFixedT(language)(key,{...values,fallbackLng:false}):i18n.getFixedT(language)('p11.error');
 return {text,language,speakable};
}
export function analysisResponse(analysis:Analysis,language:string):LocalizedResponse|undefined {
 if(analysis.safety.triggered||analysis.intent!=='add_reminder')return undefined;
 if(!canConfirm(analysis))return localizedResponse(language,analysis.missing.some(value=>value==='time'||value==='time_ambiguous')?'p11.missingTime':'p11.clarify');
 return localizedResponse(language,'p11.confirm',{medicine:analysis.draft.medicine,times:analysis.draft.times.join(', '),repeat:recurrence(analysis.draft.days_of_week,i18n.getFixedT(language))});
}
