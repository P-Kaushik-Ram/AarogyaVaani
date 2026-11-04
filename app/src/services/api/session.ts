import * as SecureStore from 'expo-secure-store';
import { usePreferences } from '../../store/preferences';
import { ApiClient, ApiError, normalizeBase } from './client';
import { clearDoses } from '../../features/tracking/storage';
import { approvedBackendCutover } from '../../../config/backendCutover';
import { bridge,bridgeKey,selectionKey,decodeVault,endpoint,scope,verifiedBridge } from './cutover';
const key='aarogyavaani.devices.v1';
let writes=Promise.resolve();
async function read(){try{return decodeVault(await SecureStore.getItemAsync(key));}catch{throw new ApiError('storage');}}
async function persist(values:Record<string,string>){try{await SecureStore.setItemAsync(key,JSON.stringify(values),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}catch{throw new ApiError('storage');}}
function update(name:string,value:string|null){
 const next=writes.catch(()=>{}).then(async()=>{const values=await read();if(value===null)delete values[name];else values[name]=value;await persist(values);});writes=next;return next;
}
// Drain existing API work before cutover; one mutation gate covers both URL aliases.
let operations=Promise.resolve(),frozen=false,writing=false;
async function operation<T>(_base:string,kind:'read'|'write',work:()=>Promise<T>):Promise<T>{
 if(frozen||(kind==='write'&&writing))throw new ApiError('busy');if(kind==='write')writing=true;
 const next=operations.catch(()=>{}).then(work);operations=next.then(()=>{},()=>{});
 try{return await next;}finally{if(kind==='write')writing=false;}
}
async function exclusive<T>(work:()=>Promise<T>):Promise<T>{
 if(frozen)throw new ApiError('busy');frozen=true;
 try{await operations;await writes.catch(()=>{});return await work();}finally{frozen=false;}
}
const vault={
 async get(base:string){const values=await read(),root=scope(base,values,approvedBackendCutover),saved=values[root],selected=values[selectionKey];
  if(selected&&(!values[selected]||normalizeBase(selected)!==selected))throw new ApiError('storage');
  if(selected&&selected!==root)throw new ApiError('cutover');
  if(root in values&&!saved)throw new ApiError('storage');if(!saved&&Object.keys(values).some(k=>k.startsWith('https://')))throw new ApiError('cutover');
  if(saved&&!selected)await update(selectionKey,root);return saved??null;
 },
 async set(base:string,token:string){const next=writes.catch(()=>{}).then(async()=>{const values=await read(),root=scope(base,values,approvedBackendCutover);if((values[selectionKey]&&values[selectionKey]!==root)||(values[root]&&values[root]!==token))throw new ApiError('cutover');values[root]=token;values[selectionKey]=root;await persist(values);});writes=next;return next;},
 async pending(base:string){const values=await read();return values[scope(base,values,approvedBackendCutover)+'.pending']==='true';},
 async setPending(base:string,value:boolean){const values=await read();await update(scope(base,values,approvedBackendCutover)+'.pending',value?'true':null);},
 async endpoint(base:string){return endpoint(base,await read(),approvedBackendCutover);},
 run:operation,
};
const clients=new Map<string,ApiClient>();
export function apiAddress(){return usePreferences.getState().serverAddress.trim()||process.env.EXPO_PUBLIC_API_URL||'';}
export function getApi(address=apiAddress()){const base=normalizeBase(address);let client=clients.get(base);if(!client){client=new ApiClient(base,vault);clients.set(base,client);}return client;}
export async function notificationScope(address:string){return scope(normalizeBase(address),await read(),approvedBackendCutover);}
export async function assertAddressAllowed(address:string){await writes;const base=normalizeBase(address),values=await read(),requested=scope(base,values,approvedBackendCutover);let current:string|undefined;try{current=scope(normalizeBase(apiAddress()),values,approvedBackendCutover);}catch{}if(current&&values[current]&&requested!==current)throw new ApiError('cutover');await vault.get(base);}
// One encrypted value is the durable commit; a lost acknowledgment can be retried.
export async function activateBackendCutover(id:string,confirmed:boolean,direction:'target'|'source'='target'){
 return exclusive(async()=>{const values=await read(),next=await verifiedBridge(values,approvedBackendCutover,id,confirmed,direction);if(next!==values){await writes.catch(()=>{});if(JSON.stringify(await read())!==JSON.stringify(values))throw new ApiError('busy');await persist(next);}clients.clear();});
}
const trackingScopes=new Map<string,Promise<string>>();
export async function existingTrackingScope(address:string){const values=await read();return values[scope(normalizeBase(address),values,approvedBackendCutover)+'.tracking']??null;}
export async function trackingScope(address=apiAddress()):Promise<string>{
 const base=await notificationScope(address);let pending=trackingScopes.get(base);
 if(!pending){pending=(async()=>{const values=await read();if(!values[base]||(values[selectionKey]&&values[selectionKey]!==base))throw new ApiError('storage');if(values[base+'.tracking'])return values[base+'.tracking'];
 const value=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;await update(base+'.tracking',value);return value;
 })().catch(error=>{trackingScopes.delete(base);throw error;});trackingScopes.set(base,pending);}return pending;
}
export async function forgetDevice(base:string){return exclusive(async()=>{
 const values=await read(),root=scope(normalizeBase(base),values,approvedBackendCutover),b=bridge(values,approvedBackendCutover),tracking=values[root+'.tracking'];if(tracking)await clearDoses(tracking);
 const next={...values};delete next[root];delete next[root+'.tracking'];delete next[root+'.pending'];if(next[selectionKey]===root)delete next[selectionKey];if(b&&b.from===root)delete next[bridgeKey];await persist(next);trackingScopes.delete(root);clients.clear();
});}
