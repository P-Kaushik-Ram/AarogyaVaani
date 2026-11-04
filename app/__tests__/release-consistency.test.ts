import { scheduledDoses, progress } from '../src/features/tracking/doses';
import { savedSummary, weeklyProgress } from '../src/features/tracking/weekly';
import { LocalReminder } from '../src/features/notifications/planner';

const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
const day=new Date(2026,9,19,12);
const base:LocalReminder={id:1,medicine:'Release synthetic',times:['08:00','13:00','22:00'],timezone:zone,days_of_week:'daily',status:'active'};

test('one active definition can produce three doses; status totals and progress use doses',()=>{
 const doses=scheduledDoses([base],day);
 expect(doses).toHaveLength(3);
 const rows=doses.map((dose,index)=>({...dose,status:(['taken','skipped','pending'] as const)[index]}));
 expect(savedSummary(rows)).toEqual({taken:1,skipped:1,pending:1,total:3,percent:33});
 expect(progress(rows)).toEqual({taken:1,total:3,percent:33});
});

test('one active reminder and four saved historical doses are consistent without changing history',()=>{
 const definitions=[0,1,2,3].map(index=>({...base,id:index+1,times:[['00:00','00:00','00:10','22:00'][index]]}));
 const rows=definitions.flatMap(reminder=>scheduledDoses([reminder],day)).map((dose,index)=>({...dose,status:(['taken','skipped','taken','pending'] as const)[index]}));
 const saved=JSON.stringify(rows);
 const active=[{...definitions[3]}];
 expect(active).toHaveLength(1);
 expect(scheduledDoses(active,day)).toHaveLength(1);
 expect(savedSummary(rows)).toEqual({taken:2,skipped:1,pending:1,total:4,percent:50});
 expect(weeklyProgress(rows,day)).toMatchObject({taken:2,skipped:1,pending:1,total:4,coveredDays:1});
 expect(JSON.stringify(rows)).toBe(saved);
});

test('inactive reminders and other weekdays contribute no doses; midnight belongs to one day',()=>{
 const tomorrow=new Date(2026,9,20,12);
 const monday={...base,times:['00:00','23:59'],days_of_week:[1]};
 expect(scheduledDoses([monday,{...base,id:2,status:'paused'}],day).map(d=>d.time)).toEqual(['00:00','23:59']);
 expect(scheduledDoses([monday],tomorrow)).toEqual([]);
 expect(savedSummary([])).toEqual({taken:0,skipped:0,pending:0,total:0,percent:null});
});
