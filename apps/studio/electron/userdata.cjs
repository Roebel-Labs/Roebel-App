'use strict';
// Which userData folder to use. Electron derives it from the app name; before the rename to
// "Ortis Studio" the app was '@roebel/studio'. A fresh install uses '<appData>/Ortis Studio'; an
// existing one keeps the old folder (saved show, media tokens). Never copied: Chromium's LevelDB
// localStorage must not be copied while open.

const path = require('node:path');

function resolveUserDataDir({ appData, exists }) {
  const next = path.join(appData, 'Ortis Studio');
  const legacy = path.join(appData, '@roebel', 'studio');
  if (!exists(next) && exists(legacy)) return legacy;
  return next;
}

module.exports = { resolveUserDataDir };
