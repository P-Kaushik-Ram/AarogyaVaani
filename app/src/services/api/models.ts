import { LanguageCode,languages } from '../../../config/languages';

export type BackendLanguage = LanguageCode;
const backendCodes:readonly string[]=languages.map(language=>language.code);
export type Days = 'daily'|number[];
export type Draft = {medicine:string|null;times:string[];days_of_week:Days|null;note:string|null};
export type Reminder = Omit<Draft,'medicine'|'days_of_week'> & {medicine:string;days_of_week:Days;id:number;user_id:string;status:'active'|'paused';language:BackendLanguage;timezone:string;updated_at:string};
export type Analysis = {detected_language:BackendLanguage|'unsupported';intent:'add_reminder'|'view_reminders'|'cancel_reminder'|'greeting'|'help'|'out_of_scope'|'unsupported_language';confidence:number;safety:{triggered:boolean;reason:string|null};draft:Draft|null;missing:string[];candidates:{times?:string[]};matches:{id:number;medicine:string}[];reply:{text:string;language:string}};
export type Pack = {code:LanguageCode;readiness_ui:boolean;readiness_understanding:boolean;readiness_voice:boolean;review_status:string};
export const validTime=(v:unknown):v is string=>typeof v==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const record=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const strings=(v:any)=>Array.isArray(v)&&v.every((s:any)=>typeof s==='string');
export const validDays=(v:any):v is Days=>v==='daily'||(Array.isArray(v)&&v.length>0&&new Set(v).size===v.length&&v.every(d=>Number.isInteger(d)&&d>=1&&d<=7));
const times=(v:any)=>strings(v)&&v.length<=24&&new Set(v).size===v.length&&v.every(validTime);
const validZone=(v:unknown)=>{try{if(typeof v!=='string')return false;new Intl.DateTimeFormat('en',{timeZone:v}).format();return true;}catch{return false;}};
export function isDraft(v:any):v is Draft{return record(v)&&(v.medicine===null||typeof v.medicine==='string')&&times(v.times)&&(v.days_of_week===null||validDays(v.days_of_week))&&(v.note===null||typeof v.note==='string');}
export function isReminder(v:any):v is Reminder{return isDraft(v)&&validDays(v.days_of_week)&&typeof v.medicine==='string'&&!!v.medicine.trim()&&v.times.length>0&&Number.isInteger((v as any).id)&&(v as any).id>0&&typeof (v as any).user_id==='string'&&['active','paused'].includes((v as any).status)&&backendCodes.includes((v as any).language)&&validZone((v as any).timezone)&&typeof (v as any).updated_at==='string'&&Number.isFinite(Date.parse((v as any).updated_at));}
export function isAnalysis(v:any):v is Analysis{return record(v)&&[...backendCodes,'unsupported'].includes(v.detected_language)&&['add_reminder','view_reminders','cancel_reminder','greeting','help','out_of_scope','unsupported_language'].includes(v.intent)&&typeof v.confidence==='number'&&v.confidence>=0&&v.confidence<=1&&record(v.safety)&&typeof v.safety.triggered==='boolean'&&(v.safety.reason===null||typeof v.safety.reason==='string')&&(v.draft===null||isDraft(v.draft))&&strings(v.missing)&&record(v.candidates)&&(v.candidates.times===undefined||times(v.candidates.times))&&Array.isArray(v.matches)&&v.matches.every((m:any)=>record(m)&&Number.isInteger(m.id)&&m.id>0&&typeof m.medicine==='string')&&record(v.reply)&&typeof v.reply.text==='string'&&typeof v.reply.language==='string';}
export function canConfirm(a:Analysis|null):a is Analysis & {draft:Draft & {medicine:string};detected_language:BackendLanguage}{return !!a&&!a.safety.triggered&&a.intent==='add_reminder'&&a.detected_language!=='unsupported'&&a.missing.length===0&&!!a.draft?.medicine?.trim()&&a.draft.medicine.length<=100&&a.draft.times.length>0&&a.draft.times.every(validTime)&&validDays(a.draft.days_of_week);}
