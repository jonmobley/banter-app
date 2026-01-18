# Banter - Phone-Based Audio Conference System

## Overview

Banter is a phone-based walkie-talkie/audio conference application that allows users to join voice conferences by calling a Twilio phone number. The system automatically connects callers to a shared conference room without requiring PINs or complex setup. It includes a contact management system to identify callers by name.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **API Style**: REST endpoints under `/api/` and `/voice/` prefixes
- **Telephony**: Twilio Voice API for phone conferencing

Key server files:
- `server/index.ts` - Express app setup and middleware
- `server/routes.ts` - API route definitions including Twilio webhook handlers
- `server/twilio.ts` - Twilio client initialization using Replit's connector system
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

### Twilio Integration
The application uses Replit's Twilio connector for authentication. Two methods to join the conference:

1. **Phone Calling**: Webhook endpoint `/voice/incoming` handles incoming phone calls and joins them to the "banter-main" conference room. The Twilio phone number (220) 242-3245 must be configured in the Twilio console to point to this webhook.

2. **Browser Calling**: Uses Twilio Voice JavaScript SDK (`@twilio/voice-sdk`) for web-based joining:
   - `POST /api/voice/token` - Generates access tokens for browser clients, automatically creates/updates a TwiML App
   - `POST /voice/browser` - TwiML endpoint for browser-initiated calls, joins the same "banter-main" conference
   - Frontend uses `Device` and `Call` from `@twilio/voice-sdk` for WebRTC audio

## External Dependencies

### Third-Party Services
- **Twilio**: Voice telephony and conference calling
  - Configured via Replit connector (manages API keys automatically)
  - Requires webhook URL configuration in Twilio console

### Database
- **PostgreSQL**: Primary data store
  - Connection via `DATABASE_URL` environment variable
  - Managed through Drizzle ORM with `drizzle-kit` for migrations

### Key NPM Packages
- `twilio` - Twilio SDK for voice API
- `@twilio/voice-sdk` - Twilio Voice JavaScript SDK for browser calling
- `drizzle-orm` / `drizzle-zod` - Database ORM and validation
- `@tanstack/react-query` - Data fetching and caching
- `express` - Web server framework
- Full shadcn/ui component suite via Radix UI primitives