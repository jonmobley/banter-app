import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.banter.app',
  appName: 'Banter',
  webDir: 'dist/public',
  
  // Server configuration for development
  server: {
    // In development, load from the live server
    // In production builds, this is ignored and local files are used
    url: process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : undefined,
    cleartext: true, // Allow HTTP in development
  },
  
  // iOS-specific configuration
  ios: {
    // Enable background audio for PTT
    backgroundColor: '#0f172a',
    contentInset: 'automatic',
    // Info.plist entries will be added manually for PTT
  },
  
  // Android-specific configuration
  android: {
    backgroundColor: '#0f172a',
    // Allow mixed content for WebRTC
    allowMixedContent: true,
  },
  
  // Plugin configurations
  plugins: {
    // Future PTT plugin config will go here
  },
};

export default config;
