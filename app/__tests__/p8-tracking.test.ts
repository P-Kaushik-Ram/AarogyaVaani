// Execute the production SQL through an Expo-shaped adapter backed by real,
// isolated SQLite. No phone database, native runtime or network is involved.
jest.mock('expo-sqlite',()=>{
 const {DatabaseSync}=require('node:sqlite');
 const fs=require('node:fs'),path=require('node:path');
 const folder=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'av-p8-'));
 const connections:any[]=[];
 return {cleanup:()=>{connections.forEach(db=>db.close());fs.rmSync(folder,{recursive:true});},openDatabaseAsync:async()=>{
 const value=new DatabaseSync(path.join(folder,'synthetic.db'));connections.push(value);
 return {
  execAsync:async(sql:string)=>value.exec(sql),
  runAsync:async(sql:string,...params:any[])=>value.prepare(sql).run(...params),
  getFirstAsync:async(sql:string,...params:any[])=>value.prepare(sql).get(...params),
  getAllAsync:async(sql:string,...params:any[])=>value.prepare(sql).all(...params),
 };}};
});
import { weeklyProgress } from '../src/features/tracking/weekly';
import { calendarDate,progress,scheduledDoses } from '../src/features/tracking/doses';
import { clearDoses,readDoses,recordDose,snapshotDoses } from '../src/features/tracking/storage';
import { LocalReminder } from '../src/features/notifications/planner';
const reminder:LocalReminder={id:7,medicine:'Synthetic calcium',times:['08:00','18:00'],timezone:'Asia/Kolkata',days_of_week:'daily',status:'active'};
const day=new Date(2026,9,17,12);
const doses=()=>scheduledDoses([reminder],day);
beforeEach(async()=>{await clearDoses('fixture');});
afterAll(()=>require('expo-sqlite').cleanup());

test('Taken, Skipped and both undo paths persist; progress counts only explicitly Taken',async()=>{
 const scheduled=doses();await snapshotDoses('fixture',scheduled);
 await recordDose('fixture',scheduled[0],'taken');await recordDose('fixture',scheduled[1],'skipped');
 let saved=await readDoses('fixture');expect(progress(saved)).toEqual({taken:1,total:2,percent:50});
 expect(saved.every(d=>!!d.recordedAt)).toBe(true);
 await recordDose('fixture',scheduled[0],'pending');await recordDose('fixture',scheduled[1],'pending');
 saved=await readDoses('fixture');expect(progress(saved)).toEqual({taken:0,total:2,percent:0});expect(saved.every(d=>d.recordedAt===null)).toBe(true);
 expect(progress([])).toEqual({taken:0,total:0,percent:0});
});
test('same medicine, same time different reminders, next day and server scopes stay independent',async()=>{
 const scheduled=scheduledDoses([reminder,{...reminder,id:8}],day);
 await snapshotDoses('fixture',scheduled);await recordDose('fixture',scheduled[0],'taken');
 expect((await readDoses('fixture')).filter(d=>d.status==='taken')).toHaveLength(1);
 expect(new Set(scheduled.map(d=>d.key)).size).toBe(4);
 expect(scheduledDoses([reminder],new Date(2026,9,18,12)).every(d=>!scheduled.some(s=>s.key===d.key))).toBe(true);
 expect(await readDoses('other-device')).toEqual([]);
});
test('repeated snapshots and concurrent writes cannot duplicate a dose or reset a saved choice',async()=>{
 const scheduled=doses();await Promise.all([snapshotDoses('fixture',scheduled),snapshotDoses('fixture',scheduled),recordDose('fixture',scheduled[0],'taken'),recordDose('fixture',scheduled[0],'skipped')]);
 await snapshotDoses('fixture',scheduled);
 const saved=await readDoses('fixture');expect(saved).toHaveLength(2);expect(saved.find(d=>d.key===scheduled[0].key)?.status).toBe('skipped');
});
test('history survives editing/deletion; a changed time is Pending and does not inherit Taken',async()=>{
 const scheduled=doses();await snapshotDoses('fixture',scheduled);await recordDose('fixture',scheduled[0],'taken');
 const edited=scheduledDoses([{...reminder,medicine:'Synthetic new name',times:['09:00','18:00']}],day);
 await snapshotDoses('fixture',edited);await snapshotDoses('fixture',[]);
 const saved=await readDoses('fixture');expect(saved).toHaveLength(3);expect(saved.find(d=>d.time==='08:00')).toMatchObject({status:'taken',medicine:reminder.medicine});
 expect(saved.find(d=>d.time==='09:00')?.status).toBe('pending');
 expect(progress(edited.map(d=>saved.find(s=>s.key===d.key)!))).toEqual({taken:0,total:2,percent:0});
});
test('a fresh JS module reads persisted SQLite status offline without any transport',async()=>{
 const transport=jest.spyOn(global,'fetch').mockRejectedValue(new Error('offline'));
 const dose=doses()[0];await recordDose('fixture',dose,'taken');
 let restarted!:typeof import('../src/features/tracking/storage');
 jest.isolateModules(()=>{restarted=require('../src/features/tracking/storage');});
 expect(await restarted.readDoses('fixture')).toEqual([expect.objectContaining({key:dose.key,status:'taken'})]);
 expect(transport).not.toHaveBeenCalled();transport.mockRestore();
});
test('scope erasure deletes only that device history',async()=>{
 await snapshotDoses('fixture',doses());await snapshotDoses('retained',doses());await clearDoses('fixture');
 expect(await readDoses('fixture')).toEqual([]);expect(await readDoses('retained')).toHaveLength(2);
});
test('selected local calendar day includes midnight boundaries and reminder-zone date',()=>{
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const local={...reminder,timezone:zone,times:['00:00','23:59']};
 const first=scheduledDoses([local],day),second=scheduledDoses([local],new Date(2026,9,18));
 expect(first.map(d=>d.time)).toEqual(['00:00','23:59']);expect(first.every(d=>calendarDate(new Date(d.at))==='2026-10-17')).toBe(true);
 expect(second.every(d=>!first.some(f=>f.key===d.key))).toBe(true);
 const tokyo=scheduledDoses([{...reminder,timezone:'Asia/Tokyo',times:['00:00','23:59']}],day);
 expect(tokyo).toHaveLength(2);expect(tokyo.every(d=>calendarDate(new Date(d.at))==='2026-10-17')).toBe(true);
});
test('DST uses existing planner semantics: nonexistent minute skipped, repeated minute once',()=>{
 // Select a device-local day covering the transition instants. On the test host
 // (UTC or India) both transitions still fall on these local calendar dates.
 const spring=scheduledDoses([{...reminder,timezone:'America/New_York',times:['02:30']}],new Date(2026,2,8,12));
 expect(spring.some(d=>d.date==='2026-03-08')).toBe(false);
 const fall=scheduledDoses([{...reminder,timezone:'America/New_York',times:['01:30']}],new Date(2026,10,1,12));
 expect(fall.filter(d=>d.date==='2026-11-01')).toHaveLength(1);
});
test('saved reminder timezone owns the instant; timezone edits do not copy Taken to a different instant',async()=>{
 const original=scheduledDoses([{...reminder,times:['08:00']}],day)[0];await recordDose('fixture',original,'taken');
 const edited=scheduledDoses([{...reminder,timezone:'Asia/Tokyo',times:['08:00']}],day)[0];
 expect(edited.key).not.toBe(original.key);expect(edited.timezone).toBe('Asia/Tokyo');await snapshotDoses('fixture',[edited]);
 const rows=await readDoses('fixture');expect(rows.find(d=>d.key===edited.key)?.status).toBe('pending');expect(rows.find(d=>d.key===original.key)?.status).toBe('taken');
});

test('weekly totals retain edited/deleted reminder snapshots offline after module restart and Undo',async()=>{
 const transport=jest.spyOn(global,'fetch').mockRejectedValue(new Error('offline'));
 try{
  const scheduled=doses();await snapshotDoses('fixture',scheduled);await recordDose('fixture',scheduled[0],'taken');await recordDose('fixture',scheduled[1],'skipped');
  await snapshotDoses('fixture',[]); // deletion never fabricates or erases historical rows
  let restarted!:typeof import('../src/features/tracking/storage');jest.isolateModules(()=>{restarted=require('../src/features/tracking/storage');});
  expect(weeklyProgress(await restarted.readDoses('fixture'),day)).toMatchObject({taken:1,skipped:1,total:2,percent:50,coveredDays:1});
  await restarted.recordDose('fixture',scheduled[0],'pending');expect(weeklyProgress(await readDoses('fixture'),day)).toMatchObject({taken:0,pending:1,percent:0});expect(transport).not.toHaveBeenCalled();
 }finally{transport.mockRestore();}
});
