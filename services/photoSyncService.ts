import { File, Directory, Paths } from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { mmkv } from '@/lib/mmkv';
import { useAppStore } from '@/store/app-store';

// ============================================================
// Types
// ============================================================

interface UploadQueueItem {
  localUri: string;
  entryId: string;
  photoIndex: number;
  retryCount: number;
}

// ============================================================
// MMKV keys
// ============================================================

const UPLOAD_QUEUE_KEY = 'photo-upload-queue';
const CACHE_MAP_KEY = 'photo-cache-map';

const BUCKET = 'weight-photos';
const CACHE_SUBDIR = 'weight-photos';
const MAX_RETRIES = 3;
let persistCounter = 0;

// ============================================================
// Helpers
// ============================================================

function loadUploadQueue(): UploadQueueItem[] {
  const raw = mmkv.getString(UPLOAD_QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveUploadQueue(queue: UploadQueueItem[]) {
  mmkv.set(UPLOAD_QUEUE_KEY, JSON.stringify(queue));
}

/** Map from storagePath -> local cache file path */
function loadCacheMap(): Record<string, string> {
  const raw = mmkv.getString(CACHE_MAP_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function saveCacheMap(map: Record<string, string>) {
  mmkv.set(CACHE_MAP_KEY, JSON.stringify(map));
}

function getCacheDir(): Directory {
  return new Directory(Paths.cache, CACHE_SUBDIR);
}

// ============================================================
// PhotoSyncService
// ============================================================

class PhotoSyncService {
  private userId: string | null = null;
  private flushing = false;

  /**
   * Copy a temporary photo (e.g. from expo-image-picker) to the persistent
   * cache directory so it survives temp-dir cleanup. Returns the new URI.
   */
  persistLocalPhoto(tempUri: string): string {
    try {
      const cacheDir = getCacheDir();
      if (!cacheDir.exists) cacheDir.create();

      const ext = tempUri.includes('.') ? tempUri.substring(tempUri.lastIndexOf('.')) : '.jpg';
      const fileName = `local_${Date.now()}_${persistCounter++}${ext}`;
      const source = new File(tempUri);
      const dest = new File(cacheDir, fileName);
      source.copy(dest);
      return dest.uri;
    } catch (err: any) {
      console.warn('[photoSync] Failed to persist photo, using original URI:', err.message);
      return tempUri;
    }
  }

  isLocalUri(uri: string): boolean {
    return uri.startsWith('file://') || uri.startsWith('ph://') || uri.startsWith('/');
  }

  isStoragePath(uri: string): boolean {
    return !this.isLocalUri(uri) && uri.includes('/');
  }

  /**
   * Called on sign-in. Sets the user, scans existing weight entries for
   * local URIs that haven't been uploaded yet, and queues them.
   */
  setUser(userId: string | null) {
    this.userId = userId;
    if (!userId) return;

    // Scan existing weight entries for local URIs and queue uploads
    const state = useAppStore.getState();
    for (const entry of state.weightEntries) {
      const photos = entry.photoUris ?? (entry.photoUri ? [entry.photoUri] : []);
      photos.forEach((uri, index) => {
        if (this.isLocalUri(uri)) {
          this.queueUpload(uri, entry.id, index);
        }
      });
    }

    // Flush immediately (fire-and-forget)
    this.flushUploadQueue();
  }

  /**
   * Add a photo to the upload queue. Persisted in MMKV so it survives
   * app restarts and offline periods.
   */
  queueUpload(localUri: string, entryId: string, photoIndex: number) {
    const queue = loadUploadQueue();

    // Deduplicate by localUri + entryId
    if (queue.some(item => item.localUri === localUri && item.entryId === entryId)) {
      return;
    }

    queue.push({ localUri, entryId, photoIndex, retryCount: 0 });
    saveUploadQueue(queue);
  }

  /**
   * Process all queued uploads. Called on reconnect, app foreground, and sign-in.
   */
  async flushUploadQueue(): Promise<void> {
    if (!this.userId || this.flushing) return;
    this.flushing = true;

    try {
      const queue = loadUploadQueue();
      if (queue.length === 0) return;

      console.log(`[photoSync] Flushing ${queue.length} queued uploads`);

      const remaining: UploadQueueItem[] = [];

      for (const item of queue) {
        try {
          // Verify the entry still exists
          const state = useAppStore.getState();
          const entry = state.weightEntries.find(e => e.id === item.entryId);
          if (!entry) {
            console.log(`[photoSync] Entry ${item.entryId} no longer exists, skipping`);
            continue;
          }

          // Verify the local URI still exists in the entry
          const photos = entry.photoUris ?? (entry.photoUri ? [entry.photoUri] : []);
          if (!photos.includes(item.localUri)) {
            console.log(`[photoSync] URI no longer in entry, skipping`);
            continue;
          }

          // Check that the local file exists
          const file = new File(item.localUri);
          if (!file.exists) {
            console.warn(`[photoSync] Local file missing: ${item.localUri}, removing from entry`);
            this.removeUriFromEntry(item.entryId, item.localUri);
            continue;
          }

          // Upload to Supabase Storage
          const storagePath = await this.uploadFile(item.localUri, item.entryId);

          // Seed cache map so getLocalUri() returns the local file immediately
          // (avoids re-downloading an image we already have on disk)
          const cacheMap = loadCacheMap();
          cacheMap[storagePath] = item.localUri;
          saveCacheMap(cacheMap);

          // Replace localUri with storagePath in the store (match by URI, not index)
          this.replaceUriInEntry(item.entryId, item.localUri, storagePath);

          console.log(`[photoSync] Uploaded ${item.localUri} -> ${storagePath}`);
        } catch (err: any) {
          console.warn(`[photoSync] Upload failed for ${item.localUri}:`, err.message);
          if (item.retryCount < MAX_RETRIES) {
            remaining.push({ ...item, retryCount: item.retryCount + 1 });
          } else {
            console.error(`[photoSync] Max retries reached for ${item.localUri}, dropping`);
          }
        }
      }

      saveUploadQueue(remaining);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Upload a local file to Supabase Storage using fetch+blob approach.
   * Returns the storage path (not a full URL).
   */
  private async uploadFile(localUri: string, entryId: string): Promise<string> {
    const userId = this.userId!;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const storagePath = `${userId}/${entryId}/${timestamp}-${random}.jpg`;

    // Read the file as blob via fetch (avoids base64 memory overhead)
    const response = await fetch(localUri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) throw error;
    return storagePath;
  }

  /**
   * Resolve a storage path to a displayable local URI.
   * Downloads from Supabase Storage if not cached.
   */
  async getLocalUri(storagePath: string): Promise<string> {
    // Check cache first
    const cacheMap = loadCacheMap();
    const cached = cacheMap[storagePath];
    if (cached) {
      // Verify the cached file still exists on disk (OS may have evicted it)
      const cachedFile = new File(cached);
      if (cachedFile.exists) return cached;
      // File was evicted, remove from cache map and re-download
      delete cacheMap[storagePath];
      saveCacheMap(cacheMap);
    }

    // Ensure cache directory exists
    const cacheDir = getCacheDir();
    if (!cacheDir.exists) {
      cacheDir.create();
    }

    // Get a signed URL then download natively via FileSystem.downloadAsync.
    // We avoid supabase.storage.download() and fetch().arrayBuffer() because
    // JS-level binary handling (Blob/ArrayBuffer) is unreliable in React Native
    // and often produces 0-byte or corrupted files.
    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 300);

    if (urlError || !urlData?.signedUrl) {
      throw new Error(`Failed to get signed URL: ${urlError?.message ?? 'no URL'}`);
    }

    const fileName = storagePath.replace(/\//g, '_');
    const destFile = new File(cacheDir, fileName);

    await File.downloadFileAsync(
      urlData.signedUrl,
      destFile,
      { idempotent: true },
    );

    const localPath = destFile.uri;

    // Update cache map
    const updatedMap = loadCacheMap();
    updatedMap[storagePath] = localPath;
    saveCacheMap(updatedMap);

    return localPath;
  }

  /**
   * Batch download and cache multiple storage paths (fire-and-forget).
   * Used after pulling weight entries from remote.
   */
  async ensureCached(storagePaths: string[]): Promise<void> {
    const unique = [...new Set(storagePaths.filter(p => this.isStoragePath(p)))];
    if (unique.length === 0) return;

    console.log(`[photoSync] Pre-caching ${unique.length} photos`);

    // Download in parallel (max 3 concurrent)
    const concurrency = 3;
    for (let i = 0; i < unique.length; i += concurrency) {
      const batch = unique.slice(i, i + concurrency);
      await Promise.allSettled(
        batch.map(path => this.getLocalUri(path).catch(err =>
          console.warn(`[photoSync] Pre-cache failed for ${path}:`, err.message)
        ))
      );
    }
  }

  /**
   * Delete photos from Supabase Storage.
   */
  async deletePhotos(storagePaths: string[]): Promise<void> {
    const toDelete = storagePaths.filter(p => this.isStoragePath(p));
    if (toDelete.length === 0) return;

    console.log(`[photoSync] Deleting ${toDelete.length} photos from storage`);

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove(toDelete);

    if (error) {
      console.warn('[photoSync] Failed to delete photos:', error.message);
    }

    // Clean up cache map
    const cacheMap = loadCacheMap();
    for (const path of toDelete) {
      const cachedPath = cacheMap[path];
      if (cachedPath) {
        try { new File(cachedPath).delete(); } catch {}
        delete cacheMap[path];
      }
    }
    saveCacheMap(cacheMap);
  }

  // --------------------------------------------------------
  // Store helpers
  // --------------------------------------------------------

  private replaceUriInEntry(entryId: string, oldUri: string, newUri: string) {
    const state = useAppStore.getState();
    const entry = state.weightEntries.find(e => e.id === entryId);
    if (!entry) return;

    const photos = entry.photoUris ?? (entry.photoUri ? [entry.photoUri] : []);
    const updatedPhotos = photos.map(uri => uri === oldUri ? newUri : uri);

    useAppStore.getState().updateWeightEntry(entryId, {
      photoUri: undefined,
      photoUris: updatedPhotos.length > 0 ? updatedPhotos : undefined,
    });
  }

  private removeUriFromEntry(entryId: string, uri: string) {
    const state = useAppStore.getState();
    const entry = state.weightEntries.find(e => e.id === entryId);
    if (!entry) return;

    const photos = entry.photoUris ?? (entry.photoUri ? [entry.photoUri] : []);
    const updatedPhotos = photos.filter(u => u !== uri);

    useAppStore.getState().updateWeightEntry(entryId, {
      photoUri: undefined,
      photoUris: updatedPhotos.length > 0 ? updatedPhotos : undefined,
    });
  }
}

export const photoSyncService = new PhotoSyncService();
