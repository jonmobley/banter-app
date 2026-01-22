/**
 * LiveKit Server Setup
 * 
 * This module provides LiveKit token generation and room management.
 * Uses environment variables for API credentials.
 */

import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://banter-4d7r2g6h.livekit.cloud';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

// Default room name for the conference
export const DEFAULT_ROOM_NAME = 'banter-main';

/**
 * Check if LiveKit is properly configured
 */
export function isLiveKitConfigured(): boolean {
  return !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

/**
 * Get LiveKit credentials
 */
export function getLiveKitCredentials() {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error('LiveKit credentials not configured. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET environment variables.');
  }
  return {
    apiKey: LIVEKIT_API_KEY,
    apiSecret: LIVEKIT_API_SECRET,
    url: LIVEKIT_URL
  };
}

/**
 * Generate an access token for a participant to join a room
 */
export async function generateToken(
  identity: string,
  roomName: string = DEFAULT_ROOM_NAME,
  options: {
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
    name?: string;
    metadata?: string;
  } = {}
): Promise<string> {
  const { apiKey, apiSecret } = getLiveKitCredentials();
  
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: options.name || identity,
    metadata: options.metadata,
    ttl: '6h' // Token valid for 6 hours
  });
  
  // Audio-only permissions for optimized voice conferencing
  // No video publish/subscribe reduces bandwidth and latency
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: options.canPublish !== false,
    canSubscribe: options.canSubscribe !== false,
    canPublishData: options.canPublishData !== false,
    // Audio-only: disable video sources
    canPublishSources: [TrackSource.MICROPHONE], // Only allow microphone, no camera/screen
  });
  
  return await at.toJwt();
}

/**
 * Get the RoomServiceClient for managing rooms
 */
export function getRoomServiceClient(): RoomServiceClient {
  const { apiKey, apiSecret, url } = getLiveKitCredentials();
  // Convert wss:// to https:// for the API endpoint
  const httpUrl = url.replace('wss://', 'https://');
  return new RoomServiceClient(httpUrl, apiKey, apiSecret);
}

/**
 * Get list of participants in a room
 */
export async function getRoomParticipants(roomName: string = DEFAULT_ROOM_NAME) {
  try {
    const client = getRoomServiceClient();
    const participants = await client.listParticipants(roomName);
    return participants;
  } catch (error: any) {
    // Room might not exist yet
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      return [];
    }
    throw error;
  }
}

/**
 * Get list of active rooms
 */
export async function listRooms() {
  const client = getRoomServiceClient();
  return await client.listRooms();
}

/**
 * Mute/unmute a participant's audio track
 * Enumerates participant's tracks to find the actual audio track SID
 */
export async function muteParticipant(
  participantIdentity: string,
  muted: boolean,
  roomName: string = DEFAULT_ROOM_NAME
) {
  const client = getRoomServiceClient();
  
  // Get the participant to find their audio track SID
  const participants = await client.listParticipants(roomName);
  const participant = participants.find(p => p.identity === participantIdentity);
  
  if (!participant) {
    throw new Error(`Participant ${participantIdentity} not found in room`);
  }
  
  // Find audio tracks (type=1 is AUDIO, source=1 is MICROPHONE)
  const audioTracks = participant.tracks?.filter(t => 
    (t.type === 1 || String(t.type) === 'AUDIO') &&
    (t.source === 1 || String(t.source) === 'MICROPHONE')
  ) || [];
  
  if (audioTracks.length === 0) {
    throw new Error(`No audio track found for participant ${participantIdentity}`);
  }
  
  // Mute all audio tracks
  for (const track of audioTracks) {
    if (track.sid) {
      await client.mutePublishedTrack(roomName, participantIdentity, track.sid, muted);
    }
  }
}

/**
 * Remove a participant from the room
 */
export async function removeParticipant(
  participantIdentity: string,
  roomName: string = DEFAULT_ROOM_NAME
) {
  const client = getRoomServiceClient();
  await client.removeParticipant(roomName, participantIdentity);
}

/**
 * Get the WebSocket URL for client connections
 */
export function getLiveKitUrl(): string {
  return LIVEKIT_URL;
}
