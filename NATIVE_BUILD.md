# Banter Native App Build Guide

This guide explains how to build Banter as a native iOS/Android app using Capacitor.

## Prerequisites

### For iOS Development
- macOS with Xcode 15+ installed
- Apple Developer account
- CocoaPods installed (`sudo gem install cocoapods`)
- Node.js 18+

### For Android Development
- Android Studio with Android SDK
- JDK 17+
- Node.js 18+

## Project Structure

```
├── ios/                     # Native iOS project (Xcode)
├── android/                 # Native Android project (Android Studio)
├── plugins/
│   └── capacitor-pushtotalk/  # Custom PTT plugin for iOS
└── capacitor.config.ts      # Capacitor configuration
```

## Building the App

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Web App

```bash
npm run build
```

### 3. Sync Capacitor

This copies the built web app to the native projects:

```bash
npx cap sync
```

### 4. Open in IDE

**iOS:**
```bash
npx cap open ios
```

**Android:**
```bash
npx cap open android
```

## iOS Push to Talk Integration

The custom `capacitor-pushtotalk` plugin wraps Apple's PushToTalk framework (iOS 16+).

### Required Capabilities

In Xcode, add these capabilities to your app:
1. **Push Notifications**
2. **Background Modes**
   - Audio, AirPlay, and Picture in Picture
   - Voice over IP
3. **Push to Talk** (requires Apple approval)

### Info.plist Entries

Add these to `ios/App/App/Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Banter needs microphone access for walkie-talkie communication</string>

<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
    <string>voip</string>
</array>
```

### Entitlements

Create `ios/App/App/App.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>development</string>
    <key>com.apple.developer.push-to-talk</key>
    <true/>
</dict>
</plist>
```

### Using the PTT Plugin

```typescript
import { PushToTalk } from 'capacitor-pushtotalk';

// Check availability
const { available } = await PushToTalk.isAvailable();

if (available) {
  // Join a PTT channel
  await PushToTalk.joinChannel({
    channelUUID: 'your-unique-channel-uuid',
    channelName: 'Banter Main'
  });

  // Listen for hardware button presses (EarPods center button)
  PushToTalk.addListener('transmissionStarted', (data) => {
    console.log('PTT started from:', data.source);
    // data.source is 'system' for hardware button, 'app' for software
  });

  PushToTalk.addListener('transmissionEnded', (data) => {
    console.log('PTT ended:', data.reason);
  });
}
```

## Hardware Button Support

When using Apple's PushToTalk framework on iOS 16+:
- **EarPods center button** triggers PTT
- **Lock screen PTT button** appears
- **Dynamic Island** shows PTT status (iPhone 14 Pro+)

## Development Workflow

1. Make changes to web code in `client/src/`
2. Build: `npm run build`
3. Sync: `npx cap sync`
4. Run in Xcode/Android Studio

Or use live reload for faster development:
```bash
npx cap run ios --livereload --external
```

## App Store Submission

### iOS Requirements
1. PushToTalk entitlement requires Apple approval
2. Submit a request via Apple Developer portal
3. Explain your walkie-talkie use case

### Testing
- PushToTalk only works on physical devices
- Simulator does not support PushToTalk framework

## Troubleshooting

### "PushToTalk requires iOS 16.0 or later"
Ensure your deployment target is iOS 16.0+

### Hardware button not working
1. Verify PushToTalk entitlement is approved
2. Check EarPods are properly connected
3. Ensure channel is joined before pressing button

### Audio issues
1. Check microphone permissions
2. Verify audio session is configured for playAndRecord
