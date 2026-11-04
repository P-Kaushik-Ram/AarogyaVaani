// Deliberately closed fields: never pass native messages, transcripts, medicine
// content, server addresses or whole event/error objects to the console.
type Details={durationMs?:number;selectedLanguage?:string;displayLanguage?:string;textLanguage?:string;voice?:string;voiceLanguage?:string;session?:number;elapsedMs?:number;locale?:string;phase?:string;problem?:string;code?:number;verified?:boolean;granted?:boolean;canAskAgain?:boolean;final?:boolean;reason?:string;service?:string;available?:boolean;tamilSupported?:boolean;tamilInstalled?:boolean;count?:number};
export function voiceDiagnostic(event:string,details:Details={}){
 if(__DEV__)console.debug('[voice]',event,details);
}
