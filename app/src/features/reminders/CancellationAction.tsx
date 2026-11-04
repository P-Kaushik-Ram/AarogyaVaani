import { cancelConfirmed } from '../notifications/service';
import { NotificationStatus } from '../notifications/Status';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { DestructiveButton } from '../../components/ui/Button';
import { ApiStatus } from '../../components/ui/ApiStatus';
import { Banner } from '../../components/ui/Banner';
import { apiAddress, getApi } from '../../services/api/session';
import { schedule } from './data';
import { Reminder } from '../../services/api/models';
export function CancellationAction({reminder}:{reminder:Reminder}){
 const {t}=useTranslation(),cache=useQueryClient(),lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[deleted,setDeleted]=useState(false);
 async function remove(){if(lock.current)return;lock.current=true;setBusy(true);setError(undefined);const base=apiAddress();try{await cancelConfirmed(base,reminder.id);setDeleted(true);void cache.invalidateQueries({queryKey:['reminders',base]});}catch(e){setError(e);}finally{lock.current=false;setBusy(false);}}
 return <>{deleted?<Banner message={t('medicine.removed')}/>:<DestructiveButton label={reminder.medicine} title={t('medicine.deleteTitle',{medicine:reminder.medicine})} body={[schedule(reminder,t),reminder.note,t('medicine.deleteBody')].filter(Boolean).join('\n')} disabled={busy} onConfirm={()=>void remove()}/>}<ApiStatus loading={busy} error={error}/>{deleted&&<NotificationStatus/>}</>;
}
