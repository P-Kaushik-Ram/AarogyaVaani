import { LanguageCode } from '../../../config/languages';
import { Analysis, isAnalysis, isReminder, Reminder, Pack, canConfirm } from './models';
import { startupSpan } from '../../startup/timing';

export type ErrorKind='config'|'network'|'timeout'|'malformed'|'auth'|'rate'|'invalid'|'server'|'missing'|'storage'|'busy'|'uncertain'|'unsupported'|'cutover';
export class ApiError extends Error {constructor(public kind:ErrorKind){super(kind);}}
export const errorKey=(e:unknown)=>`api.${e instanceof ApiError?e.kind:'network'}`;
export function normalizeBase(value:string){
  try {const u=new URL(value.trim());if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw new Error();return u.origin;}
  catch {throw new ApiError('config');}
}
export interface CredentialStorage {get(base:string):Promise<string|null>;set(base:string,token:string):Promise<void>;pending(base:string):Promise<boolean>;setPending(base:string,value:boolean):Promise<void>;endpoint?(base:string):Promise<string>;run?<T>(base:string,kind:'read'|'write',work:()=>Promise<T>):Promise<T>}
type Fetcher=(url:string,options:RequestInit)=>Promise<Response>;
const transient=(e:unknown)=>e instanceof ApiError&&['network','timeout','server'].includes(e.kind);
export class ApiClient {
  readonly base:string;
  private registration?:Promise<string>;
  private writing=false;
  constructor(base:string,private storage:CredentialStorage,private transport:Fetcher=fetch,private timeout=10000){this.base=normalizeBase(base);}
  private async request<T>(path:string,method:string,body:unknown,validate:(v:any)=>v is T,token?:string):Promise<T>{
    const finish=startupSpan(`api.${method}.${path.replace(/\/\d+(?=\/|$)/g,'/:id')}`);
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const work=(async()=>{
        const response=await this.transport((this.storage.endpoint?await this.storage.endpoint(this.base):this.base)+path,{method,signal:controller.signal,redirect:'error',headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
        if(!response.ok)throw new ApiError(response.status===401?'auth':response.status===429?'rate':response.status===422?'invalid':response.status===404?'missing':'server');
        let value:unknown;try{value=await response.json();}catch{throw new ApiError('malformed');}
        if(!validate(value))throw new ApiError('malformed');return value;
      })();
      const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ApiError('timeout'));},this.timeout);});
      const result=await Promise.race([work,deadline]);finish();return result;
    }catch(e){finish('error');if(e instanceof ApiError)throw e;throw new ApiError('network');}
    finally{if(timer)clearTimeout(timer);}
  }
  private async token(){
    if(this.registration)return this.registration;
    this.registration=(async()=>{
      const finish=startupSpan('credentials.read');
      let saved:string|null;try{saved=await this.storage.get(this.base);finish();}catch(e){finish('error');throw e instanceof ApiError?e:new ApiError('storage');}
      if(saved)return saved;
      const device=await this.request('/v1/devices','POST',{timezone:'Asia/Kolkata'},(v:any):v is {token:string;user_id:string}=>!!v&&typeof v.token==='string'&&v.token.length>0&&typeof v.user_id==='string');
      try{await this.storage.set(this.base,device.token);}catch{throw new ApiError('storage');}
      return device.token;
    })();
    try{return await this.registration;}finally{this.registration=undefined;}
  }
  private operation<T>(kind:'read'|'write',work:()=>Promise<T>){return this.storage.run?this.storage.run(this.base,kind,work):work();}
  private async read<T>(path:string,method:string,body:unknown,validate:(v:any)=>v is T){
    return this.operation('read',async()=>{const token=await this.token();
    try{return await this.request(path,method,body,validate,token);}catch(e){if(!transient(e))throw e;return this.request(path,method,body,validate,token);}});
  }
  async health(){return this.operation('read',()=>this.healthRequest());}
  private async healthRequest(){
    const valid=(v:any):v is {status:'ok';version:string}=>v?.status==='ok'&&typeof v.version==='string';
    try{return await this.request('/v1/health','GET',undefined,valid);}catch(e){if(!transient(e))throw e;return this.request('/v1/health','GET',undefined,valid);}
  }
  list(){return this.read('/v1/reminders','GET',undefined,(v:any):v is Reminder[]=>Array.isArray(v)&&v.every(isReminder));}
  languages(){return this.read('/v1/languages','GET',undefined,(v:any):v is Pack[]=>Array.isArray(v)&&v.every(p=>p&&['en','hi','ta','ml','kn','te'].includes(p.code)&&typeof p.readiness_ui==='boolean'&&typeof p.readiness_understanding==='boolean'&&typeof p.readiness_voice==='boolean'&&typeof p.review_status==='string'));}
  analyze(text:string,language:LanguageCode){if(!text.trim()||text.length>300)return Promise.reject(new ApiError('invalid'));return this.read('/v1/analyze','POST',{text,ui_language:language,input_mode:'text'},isAnalysis);}
  async create(a:Analysis,confirmed:boolean){
    if(!confirmed||!canConfirm(a))throw new ApiError('invalid');
    return this.write('/v1/reminders','POST',{...a.draft,language:a.detected_language,confirmed:true},isReminder);
  }
  async cancel(id:number,confirmed:boolean){if(!confirmed||!Number.isInteger(id)||id<1)throw new ApiError('invalid');return this.write(`/v1/reminders/${id}`,'DELETE',undefined,(v:any):v is {deleted:true}=>v?.deleted===true);}
  async deleteMe(confirmed:boolean){if(!confirmed)throw new ApiError('invalid');return this.write('/v1/me','DELETE',undefined,(v:any):v is {deleted:true}=>v?.deleted===true);}
  async hasPendingCreate(){try{return await this.storage.pending(this.base);}catch{throw new ApiError('storage');}}
  async acknowledgeCreate(){try{await this.storage.setPending(this.base,false);}catch{throw new ApiError('storage');}}
  private async write<T>(path:string,method:string,body:unknown,validate:(v:any)=>v is T){return this.operation('write',()=>this.writeRequest(path,method,body,validate));}
  private async writeRequest<T>(path:string,method:string,body:unknown,validate:(v:any)=>v is T){
    if(this.writing)throw new ApiError('busy');this.writing=true;
    try{
      const token=await this.token(),creating=path==='/v1/reminders'&&method==='POST';
      if(creating){if(await this.hasPendingCreate())throw new ApiError('uncertain');try{await this.storage.setPending(this.base,true);}catch{throw new ApiError('storage');}}
      try{
        const result=await this.request(path,method,body,validate,token);
        if(creating){try{await this.storage.setPending(this.base,false);}catch{/* Leave the marker; the server's validated success still stands. */}}
        return result;
      }catch(e){
        if(creating&&e instanceof ApiError&&['auth','rate','invalid'].includes(e.kind)){try{await this.storage.setPending(this.base,false);}catch{throw new ApiError('storage');}}
        throw e;
      }
    }finally{this.writing=false;}
  }
}
