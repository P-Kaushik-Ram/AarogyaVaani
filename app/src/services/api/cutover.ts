// A bridge changes transport only. Legacy token, history and alarm namespaces stay rooted at from.
import { ApiError,normalizeBase } from './client';
import type { BackendCutoverPlan } from '../../../config/backendCutover';
export type Manifest={version:1;user_id:string;timezone:string;digest:string;counts:Record<string,number>;writes_blocked:boolean};
export type Bridge={id:string;from:string;to:string;user:string;direction:'target'|'source'};
export const bridgeKey='@cutover.v1';
export const selectionKey='@selected.v1';
export function decodeVault(raw:string|null):Record<string,string>{
 try{const value=raw===null?{}:JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value)||Object.values(value).some(v=>typeof v!=='string'))throw new Error();return value;}
 catch{throw new ApiError('storage');}
}
export function bridge(values:Record<string,string>,plan:BackendCutoverPlan|null):Bridge|null{
 if(!values[bridgeKey])return null;
 try{const b=JSON.parse(values[bridgeKey]);if(!plan||b.id!==plan.id||b.from!==normalizeBase(plan.from)||b.to!==normalizeBase(plan.to)||b.from===b.to||!['target','source'].includes(b.direction)||typeof b.user!=='string'||!b.user||!values[b.from]||values[b.to])throw new Error();return b;}
 catch{throw new ApiError('storage');}
}
export function scope(base:string,values:Record<string,string>,plan:BackendCutoverPlan|null){const b=bridge(values,plan);return b&&(base===b.from||base===b.to)?b.from:base;}
export function endpoint(base:string,values:Record<string,string>,plan:BackendCutoverPlan|null){const b=bridge(values,plan);return b&&(base===b.from||base===b.to)?(b.direction==='target'?b.to:b.from):base;}
export async function manifest(base:string,token:string,transport:typeof fetch=fetch):Promise<Manifest>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{const work=(async()=>{const response=await transport(base+'/v1/cutover/identity',{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});
  if(!response.ok)throw new ApiError('cutover');const v=await response.json();
  if(v?.version!==1||typeof v.user_id!=='string'||!v.user_id||typeof v.timezone!=='string'||!/^([a-f0-9]){64}$/.test(v.digest)||typeof v.writes_blocked!=='boolean'||!v.counts||Object.keys(v.counts).sort().join(',')!=='deleted,devices,events,logs,paused,reminders'||Object.values(v.counts).some(n=>!Number.isSafeInteger(n)||Number(n)<0)||v.counts.devices!==1)throw new ApiError('cutover');return v as Manifest;})();
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ApiError('cutover'));},10000);});
  return await Promise.race([work,deadline]);
 }catch{throw new ApiError('cutover');}finally{if(timer)clearTimeout(timer);}
}
export async function verifiedBridge(values:Record<string,string>,plan:BackendCutoverPlan|null,id:string,confirmed:boolean,direction:'target'|'source',transport:typeof fetch=fetch){
 if(!plan||id!==plan.id||confirmed!==true)throw new ApiError('cutover');
 const from=normalizeBase(plan.from),to=normalizeBase(plan.to);
 if(from===to||[from,to].some(base=>new URL(base).hostname.includes('*')))throw new ApiError('cutover');const current=bridge(values,plan);
 if(current?.direction===direction)return values;
 if(direction==='source'&&!current)throw new ApiError('cutover');
 if((values[selectionKey]&&values[selectionKey]!==from)||!values[from]||!values[from+'.tracking']||values[to]||values[from+'.pending']==='true')throw new ApiError('cutover');
 const source=await manifest(from,values[from],transport),target=await manifest(to,values[from],transport);
 if(!source.writes_blocked||!target.writes_blocked||source.user_id!==target.user_id||source.timezone!==target.timezone||source.digest!==target.digest||Object.keys(source.counts).some(k=>source.counts[k]!==target.counts[k])||(current&&current.user!==source.user_id))throw new ApiError('cutover');
 return {...values,[selectionKey]:from,[bridgeKey]:JSON.stringify({id:plan.id,from,to,user:source.user_id,direction} satisfies Bridge)};
}
