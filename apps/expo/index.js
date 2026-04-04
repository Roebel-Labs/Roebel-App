import { Platform } from "react-native";
import "react-native-get-random-values";

// Suppress thirdweb HMR error in development (Metro/thirdweb incompatibility)
if (__DEV__) {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (
      !isFatal &&
      typeof error?.message === "string" &&
      error.message.includes("Expected HMRClient.setup()")
    ) {
      return;
    }
    originalHandler(error, isFatal);
  });
}

// Add polyfills for Node.js modules
if (typeof global.Buffer === 'undefined') {
  global.Buffer = require('buffer').Buffer;
}

if (typeof global.process === 'undefined') {
  global.process = require('process');
}

// Import Thirdweb adapter synchronously for non-web platforms
// Wrapped in try-catch so Expo Go doesn't crash (native crypto module unavailable)
if (Platform.OS !== "web") {
  try {
    require("@thirdweb-dev/react-native-adapter");
  } catch (e) {
    console.warn("Thirdweb adapter failed to load (expected in Expo Go):", e.message);
  }
}

import "react-native-reanimated";
import "expo-router/entry";
