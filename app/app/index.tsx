import React from 'react';
import { Redirect } from 'expo-router';
import { usePreferences } from '../src/store/preferences';
export default function Index(){const onboarded=usePreferences(v=>v.onboarded);return <Redirect href={onboarded?'/today':'/language'}/>;}
