import { WebPlugin } from '@capacitor/core';

import type { PushToTalkPlugin } from './definitions';

export class PushToTalkWeb extends WebPlugin implements PushToTalkPlugin {
  private mediaSessionActive = false;

  async isAvailable(): Promise<{ available: boolean }> {
    return { available: false };
  }

  async requestPermission(): Promise<{ granted: boolean }> {
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

  async enableHardwarePTT(): Promise<void> {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        this.notifyListeners('hardwarePTTPressed', {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        this.notifyListeners('hardwarePTTReleased', {});
      });
      this.mediaSessionActive = true;
    }
    console.log('PushToTalk: Hardware PTT enabled (web fallback via Media Session API)');
  }

  async disableHardwarePTT(): Promise<void> {
    if (this.mediaSessionActive && 'mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      this.mediaSessionActive = false;
    }
    console.log('PushToTalk: Hardware PTT disabled');
  }
}
