import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../components/ui/Sheet';
import { AppText } from '../components/ui/Text';
export function usePhaseNotice(){const [open,setOpen]=useState(false),{t}=useTranslation();return {show:()=>setOpen(true),notice:<Sheet visible={open} title={t('phase.notice')} onClose={()=>setOpen(false)}><AppText>{t('phase.unavailable')}</AppText></Sheet>};}
