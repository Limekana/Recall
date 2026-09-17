import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.limecore.recall',
  appName: 'Recall',
  webDir: 'dist',
  backgroundColor: '#0b0d0c',
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover'
    }
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0b0d0c'
  }
};

export default config;
