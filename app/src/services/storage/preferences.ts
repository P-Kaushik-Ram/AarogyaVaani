import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';
import { startupSpan } from '../../startup/timing';
let database: Promise<SQLiteDatabase> | undefined;
export function db() {
  if(database)return database;
  const finish=startupSpan('sqlite.open');
  return database = openDatabaseAsync('aarogyavaani.db').then(async value=>{
    await value.execAsync('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
    finish();return value;
  }).catch(error=>{database=undefined;finish('error');throw error;});
}
export async function readPreferences(): Promise<unknown> {
  const row=await (await db()).getFirstAsync<{value:string}>('SELECT value FROM kv WHERE key = ?', 'preferences');
  return row ? JSON.parse(row.value) : null;
}
export async function writePreferences(value: unknown) {
  await (await db()).runAsync('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)','preferences',JSON.stringify(value));
}
export async function readScheduleState():Promise<unknown> {
  const row=await (await db()).getFirstAsync<{value:string}>('SELECT value FROM kv WHERE key = ?', 'notification-schedules-v1');
  return row?JSON.parse(row.value):{};
}
export async function writeScheduleState(value:unknown) {
  await (await db()).runAsync('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)','notification-schedules-v1',JSON.stringify(value));
}
