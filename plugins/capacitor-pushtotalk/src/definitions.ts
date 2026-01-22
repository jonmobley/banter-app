import type { PluginListenerHandle } from '@capacitor/core';

export interface PushToTalkPlugin {
  /**
   * Check if PushToTalk is available on this device (iOS 16+ only)
   */
  isAvailable(): Promise<{ available: boolean }>;

  /**
   * Request microphone permission
   */
  requestPermission(): Promise<{ granted: boolean }>;

  /**
   * Join a PTT channel
   * @param options Channel configuration
   */
  joinChannel(options: {
    channelUUID: string;
    channelName: string;
    channelImage?: string;
  }): Promise<void>;

  /**
   * Leave the current PTT channel
   */
  leaveChannel(): Promise<void>;

  /**
   * Request to begin transmitting (PTT pressed)
   */
  requestBeginTransmitting(): Promise<void>;

  /**
   * Stop transmitting (PTT released)
   */
  stopTransmitting(): Promise<void>;

  /**
   * Set the active participant (who is currently transmitting)
   */
  setActiveRemoteParticipant(options: {
    participantName: string;
  }): Promise<void>;

  /**
   * Listen for PTT events
   */
  addListener(
    eventName: 'transmissionStarted',
    listenerFunc: (data: { source: 'system' | 'app' }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'transmissionEnded',
    listenerFunc: (data: { reason: string }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'channelJoined',
    listenerFunc: (data: { channelUUID: string }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'channelLeft',
    listenerFunc: (data: { channelUUID: string; reason: string }) => void
  ): Promise<PluginListenerHandle>;

}
