# Banter - Web-Based Audio Conference System

## Overview

Banter is a web-based walkie-talkie/audio conference application that allows users to join voice conferences from a web browser using LiveKit. The system automatically connects users to a shared conference room without requiring complex setup. It includes a contact management system, scheduled events, role-based access, and real-time speaking indicators.

## User Preferences

- Preferred communication style: Simple, everyday language
- Mobile-first design following Apple Human Interface Guidelines
- Default to muted when joining calls (prevents accidental noise)
- Browser connection is primary, phone fallback is secondary

## Talk Modes

Browser users can choose between two talk modes (accessible via Audio Settings):

| Mode | Description | Use Case |
|------|-------------|----------|
| **Hold to Talk (PTT)** | Manual control - press and hold button to unmute | Active use, prevents accidental transmission |
| **Auto (VAD)** | Voice Activity Detection - automatically unmutes when speaking | Hands-free, phone in pocket |

### VAD Implementation Details
- LiveKit provides built-in speaking detection via `ActiveSpeakersChanged` event
- Local mute/unmute handled directly via `room.localParticipant.setMicrophoneEnabled()`
- Mode preference persisted to localStorage

## Product Taxonomy

### Banter Types

| Type | Description | Status |
|------|-------------|--------|
| **Banter** | Always-on single room, 24/7 drop-in | ✅ Implemented |
| **Banter Scheduled** | Planned call with time, invites, reminders, auto-call | ✅ Implemented |
| **Banter Channels** | Multi-room walkie-talkie with host controls, monitoring | 🔮 Future |
| **Banter Broadcast** | One speaker, unlimited listeners | 🔮 Future |

### Supporting Concepts

| Concept | Description | Status |
|---------|-------------|--------|
| **Banter Groups** | Saved lists of contacts for quick invites | 🔮 Future |
| **Admin** | Can create any Banter type, manage settings | ✅ Implemented |
| **Host** | Runs a specific session (controls participants) | ✅ Implemented |
| **Participant** | Can speak and listen | ✅ Implemented |
| **Listener** | Can only hear (read-only) | ✅ Implemented |

### SaaS Considerations (Future)

When implementing pricing tiers, the database and features should support:
- Participant limits per tier
- Admin seat limits
- Feature gating (Channels/Broadcast for paid tiers)
- Usage analytics and quotas

See `next-steps.md` for the full feature roadmap.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS v4 with shadcn/ui component library (New York style)
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend is a single-page application located in `client/src/` with path aliases configured for clean imports (`@/` for client source, `@shared/` for shared code).

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript with ESM modules
- **API Style**: REST endpoints under `/api/` prefix
- **Real-time Voice**: LiveKit for WebRTC audio conferencing

Key server files:
- `server/index.ts` - Express app setup and middleware
- `server/routes.ts` - API route definitions including LiveKit token generation
- `server/livekit.ts` - LiveKit room service for token generation and room management
- `server/storage.ts` - Database access layer

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Tables**:
  - `users` - User authentication (id, username, password)
  - `contacts` - Phone contact directory (id, name, phone)

### Development vs Production
- Development: Vite dev server with HMR proxied through Express
- Production: Static files served from `dist/public/`, built with Vite and esbuild

### LiveKit Integration
The application uses LiveKit for real-time voice conferencing:

**WebSocket URL**: `wss://banter-4d7r2g6h.livekit.cloud`

**Authentication**: API credentials stored as environment secrets:
- `LIVEKIT_API_KEY` - LiveKit API key
- `LIVEKIT_API_SECRET` - LiveKit API secret

**Endpoints**:
- `POST /api/livekit/token` - Generates access tokens for browser clients (requires auth token or admin PIN in production)
- `POST /api/livekit/webhook` - Receives LiveKit room/participant events
- `GET /api/participants` - Returns current room participants with mute status

**Security**:
- Token generation requires authentication (admin PIN or valid auth token) in production
- Tokens use stable identity based on verified phone number to prevent collisions
- 6-hour token TTL with room-scoped permissions

## External Dependencies

### Third-Party Services
- **LiveKit**: Real-time WebRTC voice conferencing
  - Cloud-hosted at `livekit.cloud`
  - Credentials managed via Replit secrets
- **Twilio**: SMS for authentication codes
  - Configured via Replit connector (manages API keys automatically)
  - Used only for phone verification, not voice

### Database
- **PostgreSQL**: Primary data store
  - Connection via `DATABASE_URL` environment variable
  - Managed through Drizzle ORM with `drizzle-kit` for migrations

### Key NPM Packages
- `livekit-server-sdk` - LiveKit server SDK for token generation and room management
- `livekit-client` - LiveKit client SDK for browser WebRTC audio
- `drizzle-orm` / `drizzle-zod` - Database ORM and validation
- `@tanstack/react-query` - Data fetching and caching
- `express` - Web server framework
- Full shadcn/ui component suite via Radix UI primitives

## Recent Changes

### January 2026 - Admin & Scheduling Features
- Added `/admin` page with PIN authentication to view beta access email signups
- Implemented SMS reminder system that sends notifications 15 minutes before scheduled banters
- Created background scheduler (`server/scheduler.ts`) that auto-activates scheduled banters when their time arrives
- Added "Join Banter" button to scheduled banter cards that navigates to /mobley
- Updated Share functionality to share web link instead of obsolete phone number
- Security improvements: Admin endpoints use POST with body instead of query strings
- My Profile now persists email alongside name in localStorage

### January 2026 - LiveKit Migration
- Migrated from Twilio Voice SDK to LiveKit for real-time voice conferencing
- Removed all Twilio dependencies (`twilio`, `@twilio/voice-sdk`, `@ricky0123/vad-web`)
- Added LiveKit packages (`livekit-server-sdk`, `livekit-client`)
- Created `server/livekit.ts` for LiveKit room service
- Rewrote `server/routes.ts` with LiveKit token generation and participant management
- Rewrote `client/src/pages/mobley.tsx` with LiveKit client SDK integration
- Added security: token generation requires authentication in production
- Fixed participant tracking to use actual track mute state instead of permissions
- Note: Phone calling features removed - LiveKit is web-only
- Twilio SMS restored for authentication magic codes (phone verification)