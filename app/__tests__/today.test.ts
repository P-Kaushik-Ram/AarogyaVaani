import { occursToday,recurrence } from '../src/features/reminders/data';
jest.mock('../src/features/notifications/service',()=>({reconcileReminders:jest.fn()}));
jest.mock('expo-localization',()=>({getLocales:()=>[{languageCode:'en'}]}));
jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('expo-router',()=>({useFocusEffect:jest.fn()}));
jest.mock('../src/services/api/session',()=>({notificationScope:async(base:string)=>new URL(base).origin,}));
const r:any={status:'active',days_of_week:[1],timezone:'Asia/Kolkata'};
test('Today uses reminder timezone across midnight and ISO weekdays',()=>{expect(occursToday(r,new Date('2026-10-18T20:00:00Z'))).toBe(true);expect(occursToday(r,new Date('2026-10-19T20:00:00Z'))).toBe(false);expect(occursToday({...r,status:'paused'},new Date('2026-10-18T20:00:00Z'))).toBe(false);expect(occursToday({...r,days_of_week:'daily'},new Date('2026-10-18T20:00:00Z'))).toBe(true);});

test('unresolved recurrence uses existing translated clarification rather than a daily label',()=>{const translate:any=jest.fn((key:string)=>key);expect(recurrence(null,translate)).toBe('p2.missing.frequency');expect(translate).not.toHaveBeenCalledWith('medicine.daily');});
