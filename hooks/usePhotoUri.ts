import { useEffect, useState } from 'react';
import { photoSyncService } from '@/services/photoSyncService';

interface UsePhotoUriResult {
  displayUri: string | null;
  isLoading: boolean;
}

/**
 * Resolves a photo URI (local file path or Supabase storage path)
 * into a displayable local URI. For local URIs, returns immediately.
 * For storage paths, downloads and caches the file first.
 */
export function usePhotoUri(uri: string | undefined): UsePhotoUriResult {
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!uri) {
      setDisplayUri(null);
      setIsLoading(false);
      return;
    }

    if (photoSyncService.isLocalUri(uri)) {
      setDisplayUri(uri);
      setIsLoading(false);
      return;
    }

    // Storage path — need to download/resolve
    let cancelled = false;
    setIsLoading(true);

    photoSyncService.getLocalUri(uri).then(localPath => {
      if (!cancelled) {
        setDisplayUri(localPath);
        setIsLoading(false);
      }
    }).catch(err => {
      console.warn('[usePhotoUri] Failed to resolve:', err.message);
      if (!cancelled) {
        setDisplayUri(null);
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [uri]);

  return { displayUri, isLoading };
}
