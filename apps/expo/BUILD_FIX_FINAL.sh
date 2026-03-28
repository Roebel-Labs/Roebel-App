#!/bin/bash

# Final Build Fix - Remove Unused expo-barcode-scanner
# This script completes the Android EAS build fix

set -e  # Exit on error

echo "🔧 Final Android EAS Build Fix"
echo "================================"
echo ""
echo "✅ expo-barcode-scanner removed from package.json"
echo "✅ expo-camera is still available (used by QRScanner)"
echo ""

# Step 1: Regenerate lock file
echo "📦 Step 1/4: Regenerating package-lock.json..."
npm install --legacy-peer-deps

# Step 2: Verify expo-camera is installed
echo ""
echo "✅ Step 2/4: Verifying expo-camera installation..."
if grep -q '"expo-camera"' package-lock.json; then
  CAMERA_VERSION=$(grep -A 3 '"expo-camera"' package-lock.json | grep '"version"' | head -1 | sed 's/.*: "\(.*\)".*/\1/')
  echo "   ✅ expo-camera@$CAMERA_VERSION is installed"
else
  echo "   ❌ ERROR: expo-camera not found!"
  exit 1
fi

# Step 3: Verify expo-barcode-scanner is removed
echo ""
echo "✅ Step 3/4: Verifying expo-barcode-scanner is removed..."
if ! grep -q '"expo-barcode-scanner"' package.json; then
  echo "   ✅ expo-barcode-scanner removed from package.json"
else
  echo "   ❌ ERROR: expo-barcode-scanner still in package.json!"
  exit 1
fi

# Step 4: Commit and push
echo ""
echo "📝 Step 4/4: Committing and pushing changes..."
git add package.json package-lock.json
git commit -m "fix: remove unused expo-barcode-scanner causing Kotlin compilation errors

- Remove expo-barcode-scanner@14.0.1 from dependencies
- QR scanning already uses expo-camera@17.0.9 (via CameraView)
- Fixes Kotlin compilation error: 'Unresolved reference width/height'
- No code changes needed - QRScanner.tsx already uses expo-camera

Verification workflow remains unchanged:
- Wallet without NFT shows QR code
- Other wallet scans QR code → views request details → signs/verifies"

git push

echo ""
echo "✅ All done! Now run:"
echo ""
echo "   eas build --platform android --profile production --clear-cache"
echo ""
echo "Expected result:"
echo "  ✅ No Kotlin compilation errors"
echo "  ✅ QR scanning still works via expo-camera"
echo "  ✅ Build completes successfully"
echo ""
