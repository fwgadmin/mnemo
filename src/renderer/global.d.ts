import type { MnemoAPI } from '../preload/index';

declare global {
  interface Window {
    mnemo: MnemoAPI;
  }
}
