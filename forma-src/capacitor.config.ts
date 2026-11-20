import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'ru.sotka.forma',
  appName: 'Форма',
  webDir: 'dist',
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
};
export default config;
