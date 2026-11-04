import { db } from '../../services/storage/preferences';
import { Dose, DoseStatus } from './doses';

// App-private SQLite, matching the reviewed existing reminder cache. No tokens,
// notes, transcripts, network sync or notification calls. Never log dose data.
let ready:Promise<unknown>|undefined;
async function database(){const value=await db();await (ready??=value.execAsync('CREATE TABLE IF NOT EXISTS tracked_doses_v1 (scope TEXT NOT NULL, dose_key TEXT NOT NULL, at REAL NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,dose_key))').catch(error=>{ready=undefined;throw error;}));return value;}
let queue:Promise<unknown>=Promise.resolve();
const listeners=new Set<(scope:string)=>void>();
export function subscribeDoses(listener:(scope:string)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function changed(scope:string){listeners.forEach(listener=>listener(scope));}
function decode(raw:string):Dose{
 const value=JSON.parse(raw) as Dose;
 if(!value||!Number.isInteger(value.reminderId)||value.reminderId<=0||!Number.isFinite(value.at)||value.key!==`${value.reminderId}:${value.at}`||typeof value.medicine!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)||!['pending','taken','skipped'].includes(value.status)||(value.status==='pending'?value.recordedAt!==null:typeof value.recordedAt!=='string'||!Number.isFinite(Date.parse(value.recordedAt))))throw new Error('dose storage');
 new Intl.DateTimeFormat('en',{timeZone:value.timezone}).format(value.at);
 return value;
}
function serial<T>(work:()=>Promise<T>):Promise<T>{const next=queue.catch(()=>{}).then(work);queue=next;return next;}
export function snapshotDoses(scope:string,doses:Dose[]){return serial(async()=>{
 const value=await database();
 for(const dose of doses)await value.runAsync('INSERT OR IGNORE INTO tracked_doses_v1(scope,dose_key,at,data) VALUES (?,?,?,?)',scope,dose.key,dose.at,JSON.stringify(dose));
});}
export async function readDoses(scope:string):Promise<Dose[]>{
 await queue.catch(()=>{});
 const rows=await (await database()).getAllAsync<{data:string}>('SELECT data FROM tracked_doses_v1 WHERE scope = ? ORDER BY at DESC',scope);
 return rows.map(row=>decode(row.data));
}
export function recordDose(scope:string,dose:Dose,status:DoseStatus){return serial(async()=>{
 const value=await database();
 const row=await value.getFirstAsync<{data:string}>('SELECT data FROM tracked_doses_v1 WHERE scope = ? AND dose_key = ?',scope,dose.key);
 const saved:Dose=row?decode(row.data):dose;
 if(row&&saved.status===status)return saved;
 const next={...saved,status,recordedAt:status==='pending'?null:new Date().toISOString()};
 await value.runAsync('INSERT OR REPLACE INTO tracked_doses_v1(scope,dose_key,at,data) VALUES (?,?,?,?)',scope,next.key,next.at,JSON.stringify(next));
 changed(scope);return next;
});}
export function clearDoses(scope:string){return serial(async()=>{await (await database()).runAsync('DELETE FROM tracked_doses_v1 WHERE scope = ?',scope);changed(scope);});}
