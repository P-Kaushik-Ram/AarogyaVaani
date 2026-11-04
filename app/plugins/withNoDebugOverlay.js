const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withDangerousMod } = require('expo/config-plugins');

// App debug source sets outrank main, where blockedPermissions is applied.
module.exports = function withNoDebugOverlay(config) {
  return withDangerousMod(config, ['android', async (mod) => {
    for (const sourceSet of ['debug', 'debugOptimized']) {
      const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', sourceSet, 'AndroidManifest.xml');
      try {
        await fs.access(file);
      } catch (error) {
        if (error.code === 'ENOENT' && sourceSet === 'debugOptimized') continue;
        throw error;
      }
      const manifest = AndroidConfig.Manifest.ensureToolsAvailable(
        await AndroidConfig.Manifest.readAndroidManifestAsync(file)
      );
      AndroidConfig.Permissions.addBlockedPermissions(manifest, ['android.permission.SYSTEM_ALERT_WINDOW']);
      await AndroidConfig.Manifest.writeAndroidManifestAsync(file, manifest);
    }
    return mod;
  }]);
};
