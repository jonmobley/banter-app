# Banter - Feature Roadmap

This document outlines planned features and functionality for future development. These are not currently implemented but should be considered when designing database schemas and system architecture.

## Priority 1: Banter Channels

Multi-room walkie-talkie functionality where participants can be organized into separate audio channels.

### Use Cases
- **Live Event Production**: Stage crew on Channel 1, Front of House on Channel 2, Backstage on Channel 3
- **Restaurant Operations**: Kitchen, Floor, and Bar on separate channels
- **Construction Sites**: Ground crew, Upper floors, Safety on different channels
- **Film/TV Production**: Camera, Sound, Art, AD departments isolated

### Core Features
- Multiple named channels (e.g., "Alpha", "Bravo", "Kitchen", "Stage")
- Participants can only hear others on the same channel
- Host can see all channels in a "God view"
- Host can move participants between channels instantly
- Host can monitor multiple channels simultaneously
- Host can broadcast to all channels at once

### Phone Dial-in Options
- DTMF digit selection after connecting ("Press 1 for Channel 1...")
- Pre-assignment based on expected participant settings
- Default "lobby" channel for unassigned callers

### Technical Approach
- Each channel = separate Twilio conference room
- Channel naming: `banter-{banterId}-channel-{channelNumber}`
- Real-time WebSocket updates for channel changes
- Database: channels table linked to scheduled banters

---

## Priority 2: Banter Broadcast

One-to-many streaming where one speaker addresses unlimited listeners.

### Use Cases
- Company-wide announcements
- Training sessions
- Emergency broadcasts
- Podcast-style content

### Core Features
- Single speaker (host) at a time
- Unlimited listeners
- Optional "raise hand" to request speaking
- Host can grant speaking permission temporarily
- Listeners can react (emoji, thumbs up)

### Technical Approach
- Conference with all listeners muted by default
- Host controls who can unmute
- Separate audio stream for reactions/feedback

---

## Priority 3: Banter Groups

Saved lists of contacts for quick invites across any Banter type.

### Use Cases
- "Kitchen Team" - all restaurant kitchen staff
- "Security" - all security personnel
- "Executive Team" - leadership contacts

### Core Features
- Create/edit/delete groups
- Add/remove contacts from groups
- Use groups when scheduling Banters
- Quick "call all" for a group

### Technical Approach
- Database: groups table, group_members junction table
- UI: Group management in contacts section
- Integration: Group selector when creating scheduled Banters

---

## Priority 4: SaaS Pricing Tiers

Monetization structure with feature gating.

### Proposed Tiers

| Tier | Price | Participants | Admins | Features |
|------|-------|--------------|--------|----------|
| **Free** | $0 | 5 | 1 | Banter, Scheduled |
| **Pro** | $29/mo | 25 | 3 | + Channels, Broadcast |
| **Team** | $99/mo | Unlimited | Unlimited | + Analytics, Priority Support |
| **Enterprise** | Custom | Unlimited | Unlimited | + SSO, Custom Integrations |

### Features to Gate
- Number of concurrent participants
- Number of admin seats
- Access to Channels feature
- Access to Broadcast feature
- Number of scheduled Banters per month
- Recording/transcription (future)
- Analytics dashboard

### Technical Approach
- Database: organizations table, subscriptions table
- Stripe integration for billing
- Feature flags based on subscription tier
- Usage tracking for quota enforcement

---

## Priority 5: Additional Enhancements

### Push Notifications
- Alert when Banter starts
- Alert when someone joins
- Reminder notifications for scheduled Banters

### Call Recording
- Optional recording for compliance/reference
- Secure storage with access controls
- Transcription integration

### Speaking Analytics
- Track speaking time per participant
- Identify who talks most/least
- Export reports for hosts

### Custom Conference Rooms
- Beyond "banter-main" - create named rooms
- Persistent rooms with unique dial-in numbers
- Room-specific settings (max participants, auto-mute)

---

## Database Schema Considerations

When implementing future features, consider these schema additions:

```
organizations
  - id, name, created_at
  - subscription_tier, subscription_expires_at

groups
  - id, name, organization_id, created_at

group_members
  - id, group_id, contact_id

channels
  - id, banter_id, name, color, position
  - created_at

channel_assignments
  - id, channel_id, participant_id, assigned_at, assigned_by

usage_logs
  - id, organization_id, event_type, metadata, created_at
```

---

## Implementation Order

1. **Banter Groups** - Low complexity, useful foundation
2. **Banter Channels** - High value, moderate complexity
3. **Banter Broadcast** - Simpler than Channels (subset of functionality)
4. **SaaS Tiers** - Requires Stripe integration, billing logic
5. **Enhancements** - As needed based on user feedback
