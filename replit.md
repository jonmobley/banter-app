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

**Key endpoints accepting `banterId`**:
- `POST /api/livekit/token` — accepts `banterId` or `slug` to route to scoped room
- `GET /api/channels?banterId=...`, `GET /api/expected?banterId=...`
- `POST /api/channels` — accepts `banterId` to create scoped channel
- `POST /api/channels/:id/assign`, `POST /api/channels/unassign`, `POST /api/channels/switch` — scoped by `banterId`
- `POST /api/channels/all-call`, `POST /api/broadcast`, `POST /api/broadcast/grant` — scoped by `banterId`
- `POST /api/alert-crew` — generates banter-specific join link in SMS
- `GET /api/banters/by-slug/:slug` — resolves a banter by its slug (no auth required)

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
- **Talk Modes**: Hold to Talk (PTT) and Auto (VAD) with LiveKit's speaking detection.
- **Product Taxonomy**:
    - **Banter**: Always-on single room.
    - **Banter Scheduled**: Planned calls with invites and reminders, each an isolated session.
    - **Banter Channels**: Multi-room walkie-talkie with host controls.
    - **Banter Broadcast**: One speaker, unlimited listeners.
- **Supporting Concepts**: Banter Groups (saved contact lists), Admin, Host, Participant, Listener roles.
- **Authentication**: Email or phone-based magic code login. Admin status determined by phone number verification.
- **Scheduling**: SMS reminder system and background scheduler for auto-activating scheduled banters. SMS includes banter-specific join links.
- **Security**: Strict E.164 phone number matching, API rate limiting, bearer token authentication for all API access, and database transactions for critical operations.
- **Live Event Crew Features**: Self-service channel switching, all-call broadcast, PWA support, Wake Lock, and "Notify Group" SMS functionality.
- **Share Links**: Each scheduled banter has a unique `/join/{slug}` URL. "Copy Link" button on the schedule page.

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
