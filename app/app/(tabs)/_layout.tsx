import React from 'react';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { CalendarCheckIcon } from 'phosphor-react-native/src/icons/CalendarCheck';
import { ChatCircleIcon } from 'phosphor-react-native/src/icons/ChatCircle';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import { useTranslation } from 'react-i18next';
import { BottomTabBar,TabButton } from '../../src/components/ui/BottomTabBar';
import { createStyles } from '../../src/design/layout';
import { useTheme } from '../../src/design/ThemeProvider';
export default function TabLayout(){const {t}=useTranslation(),{colors}=useTheme(),s=createStyles(colors);return <Tabs style={s.fill}><TabSlot style={s.tabContent}/><TabList asChild><BottomTabBar><TabTrigger name="today" href="/today" asChild><TabButton label={t('tab.today')} icon={CalendarCheckIcon}/></TabTrigger><TabTrigger name="talk" href="/talk" asChild><TabButton label={t('tab.talk')} icon={ChatCircleIcon}/></TabTrigger><TabTrigger name="medicines" href="/medicines" asChild><TabButton label={t('tab.medicines')} icon={PillIcon}/></TabTrigger></BottomTabBar></TabList></Tabs>;}
