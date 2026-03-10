import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.banter.app',
  appName: 'Banter',
  webDir: 'dist/public',
  
  server: {
    url: process.env.BANTER_SERVER_URL || undefined,
    cleartext: true,
  },
  
  // iOS-specific configuration
  ios: {
    // Enable background audio for PTT
    backgroundColor: '#020617',
    contentInset: 'never',
    // Info.plist entries will be added manually for PTT
  },
  
  // Android-specific configuration
  android: {
    backgroundColor: '#020617',
    // Allow mixed content for WebRTC
    allowMixedContent: true,
  },
  
  // Plugin configurations
  plugins: {
    // Future PTT plugin config will go here
  },
};

export default config;
