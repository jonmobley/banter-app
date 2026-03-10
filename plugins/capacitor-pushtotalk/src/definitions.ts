import type { PluginListenerHandle } from '@capacitor/core';

export interface PushToTalkPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;

  joinChannel(options: {
    channelUUID: string;
    channelName: string;
    channelImage?: string;
  }): Promise<void>;

  leaveChannel(): Promise<void>;
  requestBeginTransmitting(): Promise<void>;
  stopTransmitting(): Promise<void>;

  setActiveRemoteParticipant(options: {
    participantName: string;
  }): Promise<void>;

  enableHardwarePTT(): Promise<void>;
  disableHardwarePTT(): Promise<void>;

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

  addListener(
    eventName: 'hardwarePTTPressed',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'hardwarePTTReleased',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
}
