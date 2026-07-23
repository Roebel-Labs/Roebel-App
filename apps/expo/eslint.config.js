// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // React Native text is not rendered as HTML, so quotes do not need
      // entity escaping inside <Text> components.
      "react/no-unescaped-entities": "off",
    },
  }
]);
