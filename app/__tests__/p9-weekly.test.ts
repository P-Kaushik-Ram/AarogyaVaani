import { Dose,calendarDate } from '../src/features/tracking/doses';
import { recentDays,savedSummary,weeklyProgress } from '../src/features/tracking/weekly';
const now=new Date(2026,9,17,12);
const dose=(id:number,status:Dose['status']='pending',at=new Date(2026,9,17,8).getTime()):Dose=>({key:`${id}:${at}`,reminderId:id,medicine:'Same medicine',date:'2026-10-17',time:'08:00',timezone:'Asia/Kolkata',at,status,recordedAt:status==='pending'?null:now.toISOString()});
test('only Taken enters numerator; Pending and Skipped remain in saved denominator',()=>{
 expect(savedSummary([dose(1,'taken'),dose(2,'taken'),dose(3,'skipped'),dose(4)])).toEqual({taken:2,skipped:1,pending:1,total:4,percent:50});
 expect(savedSummary([dose(1,'skipped')]).percent).toBe(0);
});
test('empty history yields unknown percentage and seven unknown days, not invented zero adherence',()=>{
 const week=weeklyProgress([],now);expect(week.percent).toBeNull();expect(week.coveredDays).toBe(0);expect(week.days).toHaveLength(7);expect(week.days.every(d=>d.percent===null&&d.doses.length===0)).toBe(true);
});
test('partial week uses only existing snapshots, counts multiple reminders and multiple times separately',()=>{
 const rows=[dose(1,'taken'),dose(2,'skipped'),dose(1,'pending',new Date(2026,9,17,20).getTime()),dose(3,'taken',new Date(2026,9,15,10).getTime())];
 const week=weeklyProgress(rows,now);expect(week).toMatchObject({total:4,taken:2,skipped:1,pending:1,percent:50,coveredDays:2});expect(week.days[0].percent).toBeNull();expect(week.days[6]).toMatchObject({total:3,percent:33});
});
test('boundary instants use phone local calendar, not the saved reminder date or UTC date',()=>{
 const start=new Date(2026,9,11),end=new Date(2026,9,18);
 const week=weeklyProgress([dose(1,'taken',+start-1),dose(2,'pending',+start),dose(3,'taken',+end-1),dose(4,'taken',+end)],now);
 expect(week).toMatchObject({total:2,taken:1,pending:1});expect(week.days[0].total).toBe(1);expect(week.days[6].total).toBe(1);
});
test.each([new Date(2027,0,2),new Date(2028,2,2),new Date(2026,2,10),new Date(2026,10,3)])('calendar days span month/year/leap/DST boundaries: %s',day=>{
 const days=recentDays(day);expect(new Set(days.map(calendarDate)).size).toBe(7);expect(calendarDate(days[6])).toBe(calendarDate(day));
 for(let i=1;i<7;i++){const expected=new Date(days[i-1].getFullYear(),days[i-1].getMonth(),days[i-1].getDate()+1);expect(calendarDate(days[i])).toBe(calendarDate(expected));}
});
test('undo recomputes totals, duplicate keys are not counted twice',()=>{
 const taken=dose(1,'taken'),pending={...taken,status:'pending' as const,recordedAt:null};expect(savedSummary([taken,taken]).total).toBe(1);expect(weeklyProgress([pending],now)).toMatchObject({taken:0,pending:1,percent:0});
});
test('rollover excludes the oldest day and includes a new unknown day without backfilling',()=>{
 const rows=[dose(1,'taken',new Date(2026,9,11,12).getTime())];expect(weeklyProgress(rows,now).total).toBe(1);expect(weeklyProgress(rows,new Date(2026,9,18)).total).toBe(0);
});
