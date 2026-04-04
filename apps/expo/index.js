import { Platform } from "react-native";
import "react-native-get-random-values";

// Suppress thirdweb HMR error in development (Metro/thirdweb incompatibility)
// Thirdweb's native-connector.js dynamically loads modules during auth,
// which triggers Metro's HMR assertion before the client is initialized.
// This is a dev-only issue — production builds are unaffected.
if (__DEV__) {
  // 1. Suppress via global error handler (catches thrown errors)
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (
      !isFatal &&
      typeof error?.message === "string" &&
      error.message.includes("Expected HMRClient.setup()")
    ) {
      return; // Silently ignore
    }
    originalHandler(error, isFatal);
  });

  // 2. Suppress via console.error (catches React Native LogBox alerts)
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (msg.includes("Expected HMRClient.setup()")) return;
    originalConsoleError(...args);
  };

  // 3. Suppress via LogBox if available
  try {
    const { LogBox } = require("react-native");
    LogBox.ignoreLogs(["Expected HMRClient.setup()"]);
  } catch {}
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
