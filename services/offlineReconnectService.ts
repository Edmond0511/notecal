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
    NetInfo.fetch().then((state) => {
      if (state.isConnected) {
        console.log('[reconnect] Online at startup — draining pending entries');
        useAppStore.getState().enqueuePendingEntries();
        photoSyncService.flushUploadQueue();
        this.runHealthSync();
      }
    });

    this.netInfoSub = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        this.scheduleDrain();
      } else {
        this.clearDebounce();
      }
    });

    this.appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        NetInfo.fetch().then((state) => {
          if (state.isConnected) {
            console.log('[reconnect] App foregrounded while online — draining pending entries');
            useAppStore.getState().enqueuePendingEntries();
            photoSyncService.flushUploadQueue();
            this.runHealthSync();
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
      this.runHealthSync();
    }, DEBOUNCE_MS);
  }

  private async runHealthSync() {
    try {
      const { getHealthSettings } = await import('@/services/healthkit/healthSettings');
      if (!getHealthSettings().healthEnabled) return;
      const { healthSyncService } = await import('@/services/healthkit/healthSyncService');
      healthSyncService.fullHealthSync();
    } catch (e) {
      console.warn('[reconnect] health sync failed', e);
    }
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
