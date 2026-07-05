// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // German UI copy is full of literal quotes and apostrophes in JSX
      // text; escaping them all adds noise without catching real bugs.
      "react/no-unescaped-entities": "off",
    },
  },
]);
