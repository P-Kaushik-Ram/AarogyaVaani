// Keep this before Router: static imports would evaluate its dependency graph first.
require('./src/startup/timing').markStartup('js-entry');
require('expo-splash-screen').preventAutoHideAsync().catch(() => {});
require('expo-router/entry');
