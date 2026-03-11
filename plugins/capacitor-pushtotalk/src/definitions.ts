import type { PluginListenerHandle } from '@capacitor/core';

export interface FlicButton {
  uuid: string;
  name: string;
  serialNumber?: string;
  connectionState?: 'connected' | 'connecting' | 'disconnected';
  batteryVoltage?: number;
}

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

  scanForFlicButtons(): Promise<{ uuid: string; name: string }>;
  stopScanForFlicButtons(): Promise<void>;
  getFlicButtons(): Promise<{ buttons: FlicButton[] }>;

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

  addListener(
    eventName: 'flicButtonFound',
    listenerFunc: (data: { uuid: string; name: string }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'flicConnected',
    listenerFunc: (data: { uuid: string; name: string }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'flicDisconnected',
    listenerFunc: (data: { uuid: string }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'flicDoubleClick',
    listenerFunc: (data: { uuid: string }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'flicHold',
    listenerFunc: (data: { uuid: string }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'audioInterrupted',
    listenerFunc: (data: { reason: string }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'audioResumed',
    listenerFunc: (data: { shouldResume: boolean }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'audioRouteChanged',
    listenerFunc: (data: { reason: string }) => void
  ): Promise<PluginListenerHandle>;
}
