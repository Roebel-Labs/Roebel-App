#!/bin/bash

# Quick Fix Script for EAS Build
# Run this script to apply all fixes and rebuild

set -e  # Exit on error

echo "🔧 Fixing EAS Build - expo-barcode-scanner Kotlin Error"
echo ""

# Step 1: Install dependencies with new lock file
echo "📦 Step 1/4: Installing dependencies..."
npm install --legacy-peer-deps

# Step 2: Verify the correct version was installed
echo ""
echo "✅ Step 2/4: Verifying expo-barcode-scanner version..."
VERSION=$(grep -A 3 '"expo-barcode-scanner"' package-lock.json | grep '"version"' | head -1 | sed 's/.*: "\(.*\)".*/\1/')
echo "   Installed version: $VERSION"

if [[ $VERSION == 14.* ]]; then
  echo "   ✅ Correct version (14.x) - proceeding"
else
  echo "   ❌ ERROR: Wrong version ($VERSION) - expected 14.x"
  echo "   Please check package.json and try again"
  exit 1
fi

# Step 3: Commit changes
echo ""
echo "📝 Step 3/4: Committing changes to git..."
git add .
git commit -m "fix: update expo-barcode-scanner to v14 for SDK 53 compatibility

- Update expo-barcode-scanner from 13.0.1 to 14.0.1
- Add explicit Kotlin version 1.9.24
- Add npm overrides for expo-linking
- Regenerate package-lock.json" || echo "   (No changes to commit or already committed)"

# Step 4: Push to remote
echo ""
echo "🚀 Step 4/4: Pushing to remote..."
git push

echo ""
echo "✅ All done! Now run:"
echo ""
echo "   eas build --platform android --profile production"
echo ""
echo "Or with cache clearing:"
echo ""
echo "   eas build --platform android --profile production --clear-cache"
echo ""
