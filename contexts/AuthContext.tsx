import { supabase } from "@/lib/supabase";
import { mmkv, saveUserSnapshot, restoreUserSnapshot } from "@/lib/mmkv";
import { configurePurchases, logInPurchases, logOutPurchases } from "@/lib/revenuecat";
import { syncService } from "@/services/syncService";
import { photoSyncService } from "@/services/photoSyncService";
import { nutritionQueue } from "@/services/nutritionQueue";
import { useAppStore } from "@/store/app-store";
import { Session, User } from "@supabase/supabase-js";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";

// Configure native Google Sign-In once at module load. webClientId is the
// OAuth 2.0 *Web* client ID from Google Cloud — its value must match the one
// configured on the Supabase Google provider so the ID-token `aud` claim
// validates server-side. iosClientId is required so the native SDK can
// initiate the OAuth request without a GoogleService-Info.plist.
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
if (googleWebClientId && googleIosClientId) {
  GoogleSignin.configure({
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId,
  });
} else {
  console.error(
    '[auth] EXPO_PUBLIC_GOOGLE_*_CLIENT_ID missing — Google Sign-In will fail',
  );
}

const LAST_USER_KEY = "last-signed-in-user-id";

// Snapshot TTL: snapshots older than this are purged on next access.
// 30 days strikes a balance between letting brief sign-outs preserve local state
// and not retaining abandoned-account data indefinitely.
const SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SNAPSHOT_PREFIX = "user-snapshot:";
const SNAPSHOT_TS_PREFIX = "user-snapshot-ts:";
const SNAPSHOT_DIRTY_PREFIX = "user-sync-dirty:";
const SNAPSHOT_PULL_PREFIX = "user-sync-pull:";

/** Stamp the snapshot timestamp so TTL can be evaluated later. */
function stampSnapshotTimestamp(userId: string) {
  mmkv.set(`${SNAPSHOT_TS_PREFIX}${userId}`, Date.now().toString());
}

/** Returns true if the snapshot for `userId` is missing or expired (>30d). */
function isSnapshotExpired(userId: string): boolean {
  const raw = mmkv.getString(`${SNAPSHOT_TS_PREFIX}${userId}`);
  if (!raw) return false; // legacy snapshots without timestamps: treat as fresh
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > SNAPSHOT_TTL_MS;
}

/** Remove a single user's snapshot keys from MMKV. */
function purgeUserSnapshot(userId: string) {
  mmkv.remove(`${SNAPSHOT_PREFIX}${userId}`);
  mmkv.remove(`${SNAPSHOT_TS_PREFIX}${userId}`);
  mmkv.remove(`${SNAPSHOT_DIRTY_PREFIX}${userId}`);
  mmkv.remove(`${SNAPSHOT_PULL_PREFIX}${userId}`);
}

/**
 * Returns true only for genuine auth revocation errors (token expired,
 * session revoked, 401). Network blips, 5xx, and parse errors return false
 * so we don't sign out on transient failures.
 */
function isAuthRevokedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; code?: string; name?: string };
  if (e.status === 401) return true;
  if (e.code === "session_expired" || e.code === "token_expired") return true;
  // Some Supabase errors surface as AuthApiError with status fields populated.
  if (e.name === "AuthApiError" && e.status === 401) return true;
  return false;
}

/** Sweep any expired snapshots across all users. Cheap, runs at app start. */
function sweepExpiredSnapshots() {
  try {
    const keys = mmkv.getAllKeys();
    for (const k of keys) {
      if (!k.startsWith(SNAPSHOT_PREFIX)) continue;
      const userId = k.slice(SNAPSHOT_PREFIX.length);
      if (isSnapshotExpired(userId)) {
        purgeUserSnapshot(userId);
      }
    }
  } catch (err) {
    console.warn("[auth] Snapshot sweep failed:", err);
  }
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Sign out and additionally purge the local snapshot for the outgoing user. */
  signOutAndPurge: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  signOutAndPurge: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Sweep expired snapshots opportunistically at app start.
    sweepExpiredSnapshots();

    // Initialize RevenueCat once. SubscriptionProvider also calls this — both
    // calls are deduplicated inside the helper.
    configurePurchases();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      // Set sync user for cold start (onAuthStateChange SIGNED_IN doesn't fire for persisted sessions)
      if (session?.user) {
        syncService.setUser(session.user.id);
        photoSyncService.setUser(session.user.id);
        // Identify the user in RevenueCat. logIn de-dupes if already identified.
        logInPurchases(session.user.id);

        // Defense-in-depth: a persisted session may have been server-side revoked
        // (sign-out from another device, password change, etc). Render the cached
        // session optimistically so UI isn't blocked, then validate against the
        // server in the background and downgrade to unauthenticated only on a
        // genuine auth failure (401 / token revoked). Network errors, 5xx, or
        // parse errors leave the optimistic session in place — the next
        // foreground/sync attempt will retry.
        supabase.auth
          .getUser()
          .then(({ data, error }) => {
            if (isAuthRevokedError(error)) {
              console.warn(
                "[auth] Persisted session was revoked by server, signing out:",
                error?.message,
              );
              // Local scope: only clean up this device's session. The server
              // has already revoked it; a global call would needlessly nuke
              // sessions on other devices the user may still want.
              supabase.auth.signOut({ scope: "local" }).catch((e) =>
                console.warn("[auth] signOut after invalid session failed:", e?.message),
              );
            } else if (error) {
              // Transient (network / 5xx / parse) — keep cached session.
              console.warn(
                "[auth] Background session validation inconclusive, keeping cached session:",
                error?.message,
              );
            } else if (!data?.user) {
              // No error but no user returned — treat as transient, do not
              // sign out. A real revocation surfaces via onAuthStateChange.
              console.warn(
                "[auth] Background session validation returned no user, keeping cached session",
              );
            }
          })
          .catch((err) => {
            // Thrown error (network etc) — leave optimistic session in place.
            console.warn("[auth] Background session validation errored:", err?.message);
          });
      }

      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state changed:", event, !!session);
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      if (event === "SIGNED_IN" && session?.user) {
        const lastUserId = mmkv.getString(LAST_USER_KEY);
        // If a different user was active, archive their data first
        if (lastUserId && lastUserId !== session.user.id) {
          nutritionQueue.clearAll();
          // Drop the outgoing user's Pro flag before snapshotting so the
          // snapshot for the incoming user (or the very brief gap before RC
          // re-identifies them) doesn't have a stale `isPro: true` carried
          // over from the previous account. SubscriptionContext will re-set
          // this from CustomerInfo once RC's logIn resolves.
          useAppStore.getState().setIsPro(false);
          useAppStore.getState().setPendingPaywallAfterAuth(false);
          saveUserSnapshot(lastUserId);
          stampSnapshotTimestamp(lastUserId);
          syncService.setUser(null);
          useAppStore.getState().clearUserData();
        }
        // Restore new user's snapshot if one exists and isn't expired.
        // Expired snapshots are purged so the user starts from a clean sync.
        if (isSnapshotExpired(session.user.id)) {
          purgeUserSnapshot(session.user.id);
        }
        const restored = restoreUserSnapshot(session.user.id);
        if (restored) {
          useAppStore.persist.rehydrate();
        }
        mmkv.set(LAST_USER_KEY, session.user.id);
        syncService.setUser(session.user.id);
        photoSyncService.setUser(session.user.id);
        // Identify the user in RevenueCat so customerInfo and the webhook
        // join key align. Fire-and-forget; SubscriptionProvider listens for
        // updates separately.
        logInPurchases(session.user.id);
        // Sync is kicked off by RootLayoutNav's effect on isAuthenticated
        // change — calling it here too would race with that caller and
        // corrupt local goals via concurrent pullAllInternal interleaving.
      } else if (event === "SIGNED_OUT") {
        // Drop the Pro flag immediately so the SIGNED_OUT → SIGNED_IN gap
        // doesn't let the incoming free user briefly bypass the free-call
        // gate that reads `isPro` synchronously in addEntry. Also clear any
        // pending-paywall flag so it doesn't leak across accounts. Place this
        // *before* the snapshot save so the outgoing user's snapshot doesn't
        // capture the stale Pro state either.
        useAppStore.getState().setIsPro(false);
        useAppStore.getState().setPendingPaywallAfterAuth(false);
        nutritionQueue.clearAll();
        // Clear the cached Google account so the next Continue-with-Google
        // press shows the account picker instead of silently reusing the
        // previous account. Best-effort — failure here doesn't block sign-out.
        GoogleSignin.signOut().catch(() => {});
        // Clear RC identity. The next sign-in will re-identify and re-fetch
        // entitlements from the server.
        logOutPurchases();
        // Archive outgoing user's data before clearing (default sign-out preserves
        // the snapshot for fast re-sign-in; use signOutAndPurge to drop it).
        const outgoingUserId = mmkv.getString(LAST_USER_KEY);
        if (outgoingUserId) {
          saveUserSnapshot(outgoingUserId);
          stampSnapshotTimestamp(outgoingUserId);
        }
        syncService.setUser(null);
        photoSyncService.setUser(null);
        useAppStore.getState().clearUserData();
        mmkv.remove(LAST_USER_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Drive Supabase's auto-refresh from app foreground state. This is the
  // canonical React Native pattern: in background, JS timers are throttled
  // and the auto-refresh loop can't reliably renew tokens. On foreground we
  // resume it, which also surfaces a server-side revocation promptly (the
  // refresh attempt fails → supabase-js fires SIGNED_OUT → AuthContext
  // cleans up). Without this, a session revoked while the app was in the
  // background can linger as a zombie until something forces a refresh.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => sub.remove();
  }, []);

  /**
   * Sign out and explicitly purge the outgoing user's local snapshot.
   * Use when the user wants to clear their data from this device (e.g. shared
   * device, account deletion). Default sign-out keeps the snapshot for TTL.
   */
  const signOutAndPurge = useCallback(async () => {
    const outgoingUserId = mmkv.getString(LAST_USER_KEY) ?? user?.id ?? null;
    try {
      // Local scope: only sign out this device. Global scope (the supabase-js
      // default) would revoke sessions on every other device, leaving them
      // with a zombie session until next refresh — causing the SettingsModal
      // "trapped without sign-out button" bug.
      await supabase.auth.signOut({ scope: "local" });
      // signOut triggers SIGNED_OUT which archives the snapshot; purge it after.
    } finally {
      // Purge regardless: even if signOut throws (e.g. network error), the
      // user explicitly asked to clear local data from this device.
      if (outgoingUserId) {
        purgeUserSnapshot(outgoingUserId);
      }
    }
  }, [user?.id]);

  const value = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
    signOutAndPurge,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
