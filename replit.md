# Banter - Web-Based Audio Conference System

## Overview

Banter is a web-based real-time audio communication application designed for groups, offering various conference types including always-on rooms, scheduled calls, multi-room channels with host controls, and one-to-many broadcast sessions. Its primary goal is to deliver a streamlined, browser-based audio experience, enabling automatic connection to shared conference rooms, contact management, scheduled events, and role-based access. The project aims to evolve into a SaaS platform with tiered features and usage analytics.

## User Preferences

- Preferred communication style: Simple, everyday language
- Mobile-first design following Apple Human Interface Guidelines
- Default to muted when joining calls (prevents accidental noise)
- Browser connection is primary, phone fallback is secondary

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS v4 with shadcn/ui (New York style)
- **Build Tool**: Vite
- **PWA Support**: `manifest.json`, service worker with offline caching, and meta tags for "Add to Home Screen".
- **Wake Lock**: Screen stays awake during active calls.

### Backend
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript with ESM modules
- **API Style**: REST endpoints under `/api/`
- **Real-time Voice**: LiveKit for WebRTC audio conferencing

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Key Tables**: `users`, `contacts`, `groups`, `channels`, `scheduled_banters`, `expected_participants`.

### Session Isolation
Each Scheduled Banter is an isolated session with its own LiveKit room, channels, participant list, channel assignments, and state. A unique shareable join link (`/join/{slug}`) is generated for each. Backward compatibility supports a global, always-on banter when `banterId` is null. Room naming conventions differentiate global and scoped sessions.

### WebSocket Scoping
WebSocket communication, including speaking states and broadcasts, is scoped by `banterId` to ensure messages are only sent to clients within the same banter session.

### LiveKit Integration
- **WebSocket URL**: `wss://banter-4d7r2g6h.livekit.cloud`
- **Authentication**: API credentials via environment variables.
- **Features**: Token generation, webhook handling, participant status, optimized audio quality, half-duplex walkie-talkie mode with chirp sounds, channel switching, all-call broadcast, and admin-controlled broadcast mode.

### Core Features
- **Talk Modes**: Hold to Talk (PTT), Auto (VAD), and Always On, utilizing LiveKit's speaking detection.
- **Product Taxonomy**: Banter (always-on), Banter Scheduled (planned, isolated calls), Banter Channels (multi-room walkie-talkie), Banter Broadcast (one-to-many).
- **Roles**: Admin, Host, Participant, Listener.
- **Authentication**: Email or phone-based magic code login; admin status determined by phone number.
- **User Profiles**: Server-side storage for name, phone, email, with auto-creation and editing capabilities.
- **Scheduling**: SMS + email reminders, background scheduler for auto-activation, banter-specific join links, and a comprehensive schedule page.
- **Security**: E.164 phone number matching, API rate limiting, bearer token authentication, and database transactions.
- **Live Event Crew Features**: Self-service channel switching, all-call broadcast, PWA support, Wake Lock, and "Notify Group" SMS functionality.
- **Admin Groups Management**: UI for creating, renaming, deleting groups, and managing members.
- **Pre-join Participant List**: Shows participants before joining a banter.
- **Away Status Detection**: Detects when participants switch tabs or get phone calls; shows amber "Away" badge via WebSocket-broadcast `awayUsers` state per banter.
- **Navigation**: Main app route is `/login` with redirects and accessible logout options.
- **Safe Areas**: Support for iOS notch/home indicator via `safe-top safe-bottom` CSS classes.

### Shared Utilities
- Standardized phone formatting and normalization for consistent data handling across client and server.

### Key Endpoints with `banterId` Scoping
Many API endpoints are designed to accept a `banterId` parameter, enabling them to operate within the context of a specific scheduled banter session. This includes endpoints for managing participants, channels, admin actions (mute, kick), and LiveKit token generation.

### Capacitor Native App (iOS/Android)
- **Configuration**: `capacitor.config.ts` for app ID and web directory.
- **Platform Projects**: Xcode project for iOS with background audio and VoIP modes; Gradle-based project for Android.
- **Custom PTT Plugin**: Intercepts hardware PTT button presses from USB-C and Bluetooth accessories, emitting JS events for `hardwarePTTPressed`/`hardwarePTTReleased`.
- **Audio Interruption Recovery**: Handles interruptions from phone calls, Siri, or alarms by muting the mic and reactivating the audio session upon resumption.

## External Dependencies

### Third-Party Services
- **LiveKit**: WebRTC voice conferencing.
- **Twilio**: SMS for authentication and notifications.
- **Resend**: Email service for verification.
- **Flic 2 SDK**: Integration for Flic 2 Bluetooth buttons (commented out, pending manual setup).

### Database
- **PostgreSQL**: Primary data store, managed via Drizzle ORM.

### Key NPM Packages
- `livekit-server-sdk` / `livekit-client`
- `drizzle-orm` / `drizzle-zod`
- `@tanstack/react-query`
- `express`
- shadcn/ui (Radix UI primitives)
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`