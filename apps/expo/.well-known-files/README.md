# Website Configuration for Deep Linking

Deploy these files to your website at `https://roebel.app/.well-known/`

## Files to Deploy

### 1. apple-app-site-association (iOS Universal Links)
- Deploy to: `https://roebel.app/.well-known/apple-app-site-association`
- Also deploy to: `https://www.roebel.app/.well-known/apple-app-site-association`
- **Important**: Serve with `Content-Type: application/json` (no file extension)

### 2. assetlinks.json (Android App Links)
- Deploy to: `https://roebel.app/.well-known/assetlinks.json`
- Also deploy to: `https://www.roebel.app/.well-known/assetlinks.json`

## Verification

After deploying, verify the files are accessible:
- https://roebel.app/.well-known/apple-app-site-association
- https://roebel.app/.well-known/assetlinks.json

### iOS Validation
Use Apple's validator: https://search.developer.apple.com/appsearch-validation-tool/

### Android Validation
Use Google's tester:
```
adb shell am start -a android.intent.action.VIEW -d "https://roebel.app/event/123"
```

## Deep Link Examples

After setup, these URLs will open the app:

| URL | Opens |
|-----|-------|
| `roebel://event/123` | Event with ID 123 |
| `roebel://news/article-slug` | News article |
| `https://roebel.app/event/123` | Event (Universal Link) |
| `https://roebel.app/news/article-slug` | News (Universal Link) |
