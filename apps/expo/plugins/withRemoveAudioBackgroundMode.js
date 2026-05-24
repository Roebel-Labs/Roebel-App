const { withInfoPlist } = require('expo/config-plugins');

/**
 * expo-audio's config plugin adds `audio` to UIBackgroundModes by default.
 * We don't have a background-audio feature (story audio only plays while
 * the viewer is foreground), so Apple review guideline 2.5.4 rejects the
 * entry. Strip it here after all other plugins have run.
 *
 * This MUST be registered AFTER `expo-audio` in app.config.ts so its
 * additions are present when this plugin filters them out.
 */
module.exports = function withRemoveAudioBackgroundMode(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = cfg.modResults.UIBackgroundModes;
    if (Array.isArray(modes) && modes.includes('audio')) {
      const filtered = modes.filter((m) => m !== 'audio');
      if (filtered.length === 0) {
        delete cfg.modResults.UIBackgroundModes;
      } else {
        cfg.modResults.UIBackgroundModes = filtered;
      }
    }
    return cfg;
  });
};
