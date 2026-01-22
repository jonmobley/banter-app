import { WebPlugin } from '@capacitor/core';

import type { PushToTalkPlugin } from './definitions';

/**
 * Web implementation of PushToTalk plugin
 * PushToTalk is iOS-only, so web provides stub implementations
 */
export class PushToTalkWeb extends WebPlugin implements PushToTalkPlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    // PushToTalk is not available on web
    return { available: false };
  }

  async requestPermission(): Promise<{ granted: boolean }> {
    // Use standard Web Audio API for microphone on web
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return { granted: true };
    } catch {
      return { granted: false };
    }
  }

  async joinChannel(_options: {
    channelUUID: string;
    channelName: string;
    channelImage?: string;
  }): Promise<void> {
    console.warn('PushToTalk: joinChannel is only available on iOS 16+');
  }

  async leaveChannel(): Promise<void> {
    console.warn('PushToTalk: leaveChannel is only available on iOS 16+');
  }

  async requestBeginTransmitting(): Promise<void> {
    console.warn('PushToTalk: requestBeginTransmitting is only available on iOS 16+');
  }

  async stopTransmitting(): Promise<void> {
    console.warn('PushToTalk: stopTransmitting is only available on iOS 16+');
  }

  async setActiveRemoteParticipant(_options: {
    participantName: string;
  }): Promise<void> {
    console.warn('PushToTalk: setActiveRemoteParticipant is only available on iOS 16+');
  }
}
