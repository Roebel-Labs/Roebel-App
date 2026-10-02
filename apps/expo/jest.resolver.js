'use strict';

// Jest resolver for the Expo app. Same as @react-native/jest-preset's resolver (react-native subpaths stay
// mockable), plus one fallback that mirrors metro.config.js: workspace packages written for Node ESM
// (packages/protocol) import their siblings as `./x.js` while the file on disk is `x.ts`. Only when the
// literal `.js` path fails, and only for relative imports from a workspace package's own source, the
// extensionless path is tried.
const WORKSPACE_SOURCE = /[\\/]packages[\\/][^\\/]+[\\/]src[\\/]/;

function resolveWithPreset(path, options) {
  const originalPackageFilter = options.packageFilter;
  return options.defaultResolver(path, {
    ...options,
    packageFilter: (pkg) => {
      const filteredPkg = originalPackageFilter ? originalPackageFilter(pkg) : pkg;
      if (filteredPkg.name === 'react-native') delete filteredPkg.exports;
      return filteredPkg;
    },
  });
}

module.exports = (path, options) => {
  try {
    return resolveWithPreset(path, options);
  } catch (err) {
    const fromWorkspace = WORKSPACE_SOURCE.test(`${options.basedir}/`) && !/node_modules/.test(options.basedir);
    if (fromWorkspace && /^\.\.?\//.test(path) && path.endsWith('.js')) {
      return resolveWithPreset(path.slice(0, -3), options);
    }
    throw err;
  }
};
