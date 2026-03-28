const { withProjectBuildGradle } = require('expo/config-plugins');

/**
 * Exclude older bcprov-jdk15on to resolve duplicate class conflict
 * with the newer bcprov-jdk15to18 pulled by other dependencies.
 */
module.exports = function withExcludeBouncyCastle(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      const contents = config.modResults.contents;

      // Only add if not already present
      if (!contents.includes("exclude group: 'org.bouncycastle', module: 'bcprov-jdk15on'")) {
        config.modResults.contents = contents.replace(
          /allprojects\s*\{/,
          `allprojects {\n  configurations.all {\n    exclude group: 'org.bouncycastle', module: 'bcprov-jdk15on'\n  }`
        );
      }
    }
    return config;
  });
};
