import NetInfo, { NetInfoSubscription } from '@react-native-community/netinfo';
import { AppState, NativeEventSubscription } from 'react-native';
import { useAppStore } from '@/store/app-store';
import { photoSyncService } from '@/services/photoSyncService';

const DEBOUNCE_MS = 2000;

class OfflineReconnectService {
  private netInfoSub: NetInfoSubscription | null = null;
  private appStateSub: NativeEventSubscription | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;

    // Wait for store hydration before doing anything
    const hydrated = useAppStore.persist.hasHydrated();
    if (hydrated) {
      this.init();
    } else {
      useAppStore.persist.onFinishHydration(() => {
        this.init();
      });
    }
  }

  private init() {
    // Drain pending entries and flush photo uploads on startup if online
    NetInfo.fetch().then((state) => {
      if (state.isConnected) {
        console.log('[reconnect] Online at startup — draining pending entries');
        useAppStore.getState().enqueuePendingEntries();
        photoSyncService.flushUploadQueue();
      }
    });

    // Listen for connectivity changes — schedule drain whenever connected
    // No wasOffline flag needed; enqueuePendingEntries is a no-op when nothing is pending
    this.netInfoSub = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        this.scheduleDrain();
      } else {
        this.clearDebounce();
      }
    });

    // Backup: also drain when app returns to foreground
    // NetInfo events can be unreliable on some devices/simulators
    this.appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        NetInfo.fetch().then((state) => {
          if (state.isConnected) {
            console.log('[reconnect] App foregrounded while online — draining pending entries');
            useAppStore.getState().enqueuePendingEntries();
            photoSyncService.flushUploadQueue();
          }
        });
      }
    });
  }

  private scheduleDrain() {
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      console.log('[reconnect] Connectivity detected — draining pending entries');
      useAppStore.getState().enqueuePendingEntries();
      photoSyncService.flushUploadQueue();
    }, DEBOUNCE_MS);
  }

  private clearDebounce() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  stop() {
    this.netInfoSub?.();
    this.netInfoSub = null;
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.clearDebounce();
    this.started = false;
  }
}

export const offlineReconnectService = new OfflineReconnectService();
