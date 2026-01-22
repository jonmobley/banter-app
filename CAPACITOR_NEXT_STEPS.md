# Capacitor Native App - Next Steps

## What's Ready Now

| Component | Status |
|-----------|--------|
| Capacitor configured | ✅ |
| iOS project created | ✅ |
| Android project created | ✅ |
| Custom PTT plugin scaffold | ✅ |
| Web app with walkie-talkie features | ✅ |

## To Build the Native iOS App

### 1. Get a Mac with Xcode

You'll need:
- macOS Monterey or later
- Xcode 15+ (free from App Store)
- Apple Developer account ($99/year for App Store distribution)

### 2. Install Dependencies on Mac

```bash
# Install CocoaPods (iOS dependency manager)
sudo gem install cocoapods

# Install Node.js if not present
brew install node
```

### 3. Clone and Build

```bash
# Clone your Replit project or download it
git clone <your-repo>
cd banter

# Install dependencies
npm install

# Build the web app
npm run build

# Sync to native projects
npx cap sync

# Open in Xcode
npx cap open ios
```

### 4. Configure Xcode Project

1. **Select your team** in Signing & Capabilities
2. **Add capabilities:**
   - Push Notifications
   - Background Modes (Audio, Voice over IP)
   - Push to Talk (requires Apple approval)

3. **Update Info.plist:**
   - Add microphone usage description
   - Configure background modes

### 5. Request Apple PTT Entitlement

To use hardware button control (EarPods center button):
1. Go to Apple Developer portal
2. Request Push to Talk entitlement
3. Explain your walkie-talkie use case
4. Wait for Apple approval (can take weeks)

### 6. Test on Physical Device

- PTT framework only works on real devices
- Simulator does not support PushToTalk
- Connect iPhone via USB or wireless debugging

## For Android

Android doesn't have an equivalent PTT framework, but the app works in browser mode. The Android native shell provides:
- Home screen icon
- Full screen experience
- Faster loading

## Alternative: Progressive Web App (PWA)

You can also install Banter as a PWA on iOS/Android without native builds:
1. Open the web app in Safari (iOS) or Chrome (Android)
2. Tap Share → Add to Home Screen
3. App installs without App Store

**Limitation:** PWA cannot access hardware buttons - native build required for EarPods PTT control.

## Development Workflow

```bash
# Make changes to web code
# Then sync and run:
npm run build
npx cap sync
npx cap run ios
```

For live reload during development:
```bash
npx cap run ios --livereload --external
```

## Files Reference

| File | Purpose |
|------|---------|
| `capacitor.config.ts` | Capacitor configuration |
| `ios/` | Native iOS Xcode project |
| `android/` | Native Android Studio project |
| `plugins/capacitor-pushtotalk/` | Custom PTT plugin |
| `NATIVE_BUILD.md` | Detailed build instructions |

## Questions?

The PTT plugin scaffold is ready but requires:
1. Apple Developer account
2. Apple approval for PTT entitlement
3. Mac with Xcode for building

Once you have these, the plugin can be completed and tested.
