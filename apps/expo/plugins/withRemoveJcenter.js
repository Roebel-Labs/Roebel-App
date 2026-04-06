const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Remove jcenter() from react-native-aes-gcm-crypto's build.gradle.
 * jcenter() was removed in Gradle 9 and the library hasn't been updated.
 * mavenCentral() already mirrors everything that was on jcenter.
 */
module.exports = function withRemoveJcenter(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradlePath = path.join(
        path.dirname(require.resolve('react-native-aes-gcm-crypto/package.json')),
        'android',
        'build.gradle'
      );

      if (fs.existsSync(buildGradlePath)) {
        let contents = fs.readFileSync(buildGradlePath, 'utf-8');
        contents = contents.replace(/\s*jcenter\(\)\n?/g, '\n');
        fs.writeFileSync(buildGradlePath, contents, 'utf-8');
      }

      return config;
    },
  ]);
};
