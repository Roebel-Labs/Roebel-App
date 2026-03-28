#!/usr/bin/env bash

# EAS Build Post-Install npm Lifecycle Hook
# Triggered via: "eas-build-post-install" in package.json
# Runs AFTER yarn install and expo prebuild (Android) / pod install (iOS)

set -e

echo "🔧 EAS Post-Install Hook: Configuring Android 16KB page size support..."

# Check if this is an Android build (Android folder exists)
if [ ! -d "android" ]; then
  echo "⏭️  Skipping Android configuration (iOS build or Android folder not generated yet)"
  exit 0
fi

# Update AndroidManifest.xml to support 16KB pages
if [ -f "android/app/src/main/AndroidManifest.xml" ]; then
  echo "✅ Found AndroidManifest.xml, applying 16KB configuration..."

  # Add extractNativeLibs="false" if not present
  # This is REQUIRED for 16KB page size support
  if ! grep -q 'android:extractNativeLibs="false"' android/app/src/main/AndroidManifest.xml; then
    sed -i.bak 's/<application /<application android:extractNativeLibs="false" /' android/app/src/main/AndroidManifest.xml
    rm -f android/app/src/main/AndroidManifest.xml.bak
    echo "✅ Added extractNativeLibs=\"false\" to AndroidManifest.xml"
  else
    echo "✅ extractNativeLibs already configured"
  fi

  echo ""
  echo "✅ Android 16KB page size configuration complete!"
  echo "📋 Configuration summary:"
  echo "  - extractNativeLibs: false (keeps native libs uncompressed for 16KB alignment)"
  echo "  - AGP 8.7.3 (configured in app.config.ts)"
  echo "  - CMAKE ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES: ON (configured in app.config.ts)"
  echo "  - gradle.properties maxPageSizeBytes: 16384 (configured in app.config.ts)"
else
  echo "⚠️  AndroidManifest.xml not found - this is normal if prebuild hasn't run yet"
  echo "⏭️  Skipping Android configuration"
fi

exit 0
