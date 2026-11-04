jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
import { openDatabaseAsync } from 'expo-sqlite';
import { readPreferences,readScheduleState } from '../src/services/storage/preferences';
test('a failed SQLite open can recover; successful initialization is shared by subsequent local reads',async()=>{
 const db={execAsync:jest.fn().mockResolvedValue(undefined),getFirstAsync:jest.fn().mockResolvedValue(null)};
 (openDatabaseAsync as jest.Mock).mockRejectedValueOnce(new Error('SQLite unavailable')).mockResolvedValue(db);
 await expect(readPreferences()).rejects.toThrow('SQLite unavailable');
 await expect(readPreferences()).resolves.toBeNull();await expect(readScheduleState()).resolves.toEqual({});
 expect(openDatabaseAsync).toHaveBeenCalledTimes(2);expect(db.execAsync).toHaveBeenCalledTimes(1);
});
