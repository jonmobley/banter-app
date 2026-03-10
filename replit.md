# Banter - Web-Based Audio Conference System

## Overview

Banter is a web-based walkie-talkie/audio conference application that enables real-time audio communication for groups. It offers various conference types, including always-on rooms, scheduled calls, multi-room channels with host controls, and one-to-many broadcast sessions. The system aims to provide a streamlined, browser-based audio experience, automatically connecting users to shared conference rooms while supporting contact management, scheduled events, and role-based access. The project envisions future SaaS capabilities with tiered features and usage analytics.

## User Preferences

- Preferred communication style: Simple, everyday language
- Mobile-first design following Apple Human Interface Guidelines
- Default to muted when joining calls (prevents accidental noise)
- Browser connection is primary, phone fallback is secondary

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS v4 with shadcn/ui (New York style)
- **Build Tool**: Vite
- **PWA Support**: `manifest.json`, service worker, and meta tags for "Add to Home Screen".
- **Wake Lock**: Screen stays awake during active calls.

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript with ESM modules
- **API Style**: REST endpoints under `/api/`
- **Real-time Voice**: LiveKit for WebRTC audio conferencing

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Key Tables**: `contacts`, `groups`, `group_members`, `channels`, `channel_assignments`, `scheduled_banters`, `expected_participants`.

### Development vs Production
- Development: Vite dev server proxied through Express.
- Production: Static files served from `dist/public/`.

### Session Isolation Architecture
Each Scheduled Banter is a fully isolated session with its own:
- **LiveKit room**: `banter-{slug}-main` (vs `banter-main` for the always-on global banter)
- **Channels**: Scoped by `banterId` column — each banter has its own channel set
- **Participant list**: `expected_participants` scoped by `banterId`
- **Channel assignments**: `channel_assignments` scoped by `banterId`
- **Broadcast/All-Call state**: Server-side `Map<string, BanterSessionState>` keyed by `banterId` (or `"global"`)
- **Shareable join link**: `/join/{slug}` — 6-char alphanumeric slug, auto-generated on banter creation

**Backward compatibility**: When `banterId` is `null`, all queries return global/un-scoped records (the always-on banter at `/mobley`).

**Room naming convention**:
- Global: `banter-main`, `banter-channel-{n}`, `banter-all-call`, `banter-broadcast`
- Scoped: `banter-{slug}-main`, `banter-{slug}-channel-{n}`, `banter-{slug}-all-call`, `banter-{slug}-broadcast`

### WebSocket Scoping
- `frontendClients` is a `Map<WebSocket, { banterId: string | null }>` — each WS client is associated with a banter
- `speakingStates` is a `Map<string, Map<string, boolean>>` keyed by banterId — speaking indicators are scoped per banter
- `broadcastToFrontend()` and `broadcastSpeakingState()` only send to clients in the same banter
- Clients send `join-banter` WS message on connect and when switching banters
- LiveKit webhook events extract banterId from room name for scoped broadcasts

### LiveKit Integration
- **WebSocket URL**: `wss://banter-4d7r2g6h.livekit.cloud`
- **Authentication**: API credentials via `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` environment variables.
- **Endpoints**: Token generation (`POST /api/livekit/token`), webhook handling (`POST /api/livekit/webhook`), participant status (`GET /api/participants`).
- **Audio Quality**: Optimized settings (Mono, 48kHz, 32kbps Opus), DTX, RED.
- **Walkie-Talkie Enhancements**: Half-duplex mode (incoming audio muted when PTT pressed), chirp sounds on PTT start/end.
- **Channel Switching**: Users can switch between assigned channels.
- **All-Call Broadcast**: Admin-activated mode forcing all clients to all-call room (scoped per banter).
- **Broadcast Mode**: Admin-controlled one-to-many broadcast with speaker granting and raise-hand functionality (scoped per banter).

### Core Features
- **Talk Modes**: Hold to Talk (PTT), Auto (VAD), and Always On with LiveKit's speaking detection. "Always On" correctly preserves unmuted state after channel switches.
- **Product Taxonomy**:
    - **Banter**: Always-on single room.
    - **Banter Scheduled**: Planned calls with invites and reminders, each an isolated session.
    - **Banter Channels**: Multi-room walkie-talkie with host controls.
    - **Banter Broadcast**: One speaker, unlimited listeners.
- **Supporting Concepts**: Banter Groups (saved contact lists), Admin, Host, Participant, Listener roles.
- **Authentication**: Email or phone-based magic code login. Admin status determined by phone number verification.
- **Scheduling**: SMS reminder system and background scheduler for auto-activating scheduled banters. SMS includes banter-specific join links. Schedule page validates against past dates.
- **Security**: Strict E.164 phone number matching, API rate limiting, bearer token authentication for all API access (including GET /api/participants, GET /api/speaking, GET /api/channels/all-call), and database transactions for critical operations (deleteGroup, deleteChannel).
- **Live Event Crew Features**: Self-service channel switching, all-call broadcast, PWA support, Wake Lock, and "Notify Group" SMS functionality.
- **Share Links**: Each scheduled banter has a unique `/join/{slug}` URL. "Copy Link" button on the schedule page.
- **Navigation**: Logout available from account, admin, and mobley pages. Admin page discoverable from account page for admin users. 404 page has user-friendly messaging with "Go Home" link.

### Shared Utilities
- **Phone formatting**: `formatPhone()` in `client/src/lib/utils.ts` — shared by mobley and contacts pages
- **Phone normalization**: `normalizePhone()` in `shared/schema.ts` — used by server for E.164 matching

### Key Endpoints with `banterId` Scoping
All endpoints below accept `banterId` to scope to a specific scheduled banter:
- `GET /api/participants?banterId=...` — queries correct LiveKit room (auth required)
- `POST /api/admin/mute` — accepts `banterId` to mute in correct room
- `POST /api/admin/kick` — accepts `banterId` to kick from correct room
- `POST /api/livekit/token` — accepts `banterId` or `slug` to route to scoped room
- `GET /api/channels?banterId=...`, `GET /api/expected?banterId=...`
- `POST /api/channels` — accepts `banterId` to create scoped channel
- `POST /api/channels/:id/assign`, `POST /api/channels/unassign`, `POST /api/channels/switch` — scoped by `banterId`
- `POST /api/channels/all-call`, `POST /api/broadcast`, `POST /api/broadcast/grant` — scoped by `banterId`
- `POST /api/alert-crew` — generates banter-specific join link in SMS
- `GET /api/banters/by-slug/:slug` — resolves a banter by its slug (no auth required)

## External Dependencies

### Third-Party Services
- **LiveKit**: Real-time WebRTC voice conferencing (cloud-hosted).
- **Twilio**: SMS for authentication codes and scheduled event notifications.
- **Resend**: Email service for sending verification emails.

### Database
- **PostgreSQL**: Primary data store, managed via Drizzle ORM.

### Key NPM Packages
- `livekit-server-sdk` / `livekit-client`
- `drizzle-orm` / `drizzle-zod`
- `@tanstack/react-query`
- `express`
- shadcn/ui components (Radix UI primitives)
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`

### Capacitor Native App (iOS/Android)
- **Config**: `capacitor.config.ts` — app ID `com.banter.app`, web dir `dist/public`
- **iOS project**: `ios/App/` — Xcode project with background audio & VoIP modes, microphone permission
- **Android project**: `android/` — Gradle-based project
- **Custom PTT Plugin**: `plugins/capacitor-pushtotalk/` — detects hardware PTT button presses

### Hardware PTT Architecture
USB-C and Bluetooth PTT accessories (Klein Victory, PrymeBLU, generic BLE PTT buttons) send HID media key events when their button is pressed. The Capacitor plugin intercepts these:

**iOS flow**: `remoteControlReceived` in AppDelegate → plugin's `handleRemoteControlEvent` → emits `hardwarePTTPressed`/`hardwarePTTReleased` JS events
**Android flow**: `handleOnKeyDown`/`handleOnKeyUp` for `KEYCODE_MEDIA_PLAY_PAUSE`/`KEYCODE_HEADSETHOOK` → emits same JS events
**Web fallback**: Media Session API handlers + `keydown`/`keyup` for media key codes (best-effort, may not work on iOS Safari)

**Frontend integration** (`mobley.tsx`): On room connect, imports `capacitor-pushtotalk` plugin, calls `enableHardwarePTT()`, and listens for `hardwarePTTPressed`/`hardwarePTTReleased` events to trigger `startTalking()`/`stopTalking()`. Falls back gracefully when plugin unavailable (browser-only mode).

**Compatible hardware**: Any USB-C or Bluetooth accessory that sends standard HID media key events — Klein Victory, Klein BLU-PTT+, PrymeBLU BT-PTT-Z, Sheepdog Z-PTT, generic Amazon BLE PTT buttons, iPhone 15+ Action Button, AirPods/EarPods inline button, Flic 2 Bluetooth button.

**To build/test**: Open `ios/App/App.xcworkspace` in Xcode on a Mac, run on a physical iPhone with the earpiece plugged in. Requires Apple Developer account ($99/year) for device deployment.

### Flic 2 Button Integration
The Capacitor PTT plugin includes Flic 2 SDK integration (commented out, pending manual SDK setup). Flic buttons connect via Bluetooth LE and emit the same `hardwarePTTPressed`/`hardwarePTTReleased` events as wired accessories.

**SDK sources**:
- iOS: `flic2lib.xcframework` from https://github.com/50ButtonsEach/flic2lib-ios (manual XCFramework install in Xcode)
- Android: `flic2lib-android` via JitPack (uncomment dependency in `plugins/capacitor-pushtotalk/android/build.gradle`)

**Activation steps**:
1. Register at https://partners.flic.io/ to get App ID and App Secret
2. iOS: Download `flic2lib.xcframework`, drag into Xcode Frameworks (Embed & Sign), uncomment Flic code blocks in `PushToTalkPlugin.swift`
3. Android: Uncomment `flic2lib-android` dependency in `build.gradle`, uncomment Flic code blocks in `PushToTalkPlugin.java`

**Plugin methods**: `scanForFlicButtons()`, `stopScanForFlicButtons()`, `getFlicButtons()` — TypeScript definitions in `plugins/capacitor-pushtotalk/src/definitions.ts`
**Events**: `flicButtonFound`, `flicConnected`, `flicDisconnected`, `flicDoubleClick`, `flicHold`
**Pairing UI**: Audio Settings modal in `mobley.tsx` — "Flic PTT Button" section with scan/pair/status display

**Info.plist**: `NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription`, `UIBackgroundModes` includes `bluetooth-central`, `LSApplicationQueriesSchemes` includes `flic20`
**AndroidManifest.xml**: Bluetooth permissions for both pre-API 31 (`BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE_LOCATION`) and API 31+ (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`)

### PTT Button UI
- Bottom controls use two-row layout: small utility buttons (settings, channels, all-call, broadcast, hangup) on top, large centered PTT button (160px / `w-40 h-40`) below
- PTT button is the dominant visual element — walkie-talkie-style layout
- All talk modes (Hold, Toggle, Always On, Raise Hand) use the same large button size
