import { supabase } from "@/lib/supabase";
import { mmkv, saveUserSnapshot, restoreUserSnapshot } from "@/lib/mmkv";
import { syncService } from "@/services/syncService";
import { nutritionQueue } from "@/services/nutritionQueue";
import { useAppStore } from "@/store/app-store";
import { Session, User } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState } from "react";

const LAST_USER_KEY = "last-signed-in-user-id";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
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
          saveUserSnapshot(lastUserId);
          syncService.setUser(null);
          useAppStore.getState().clearUserData();
        }
        // Restore new user's snapshot if one exists
        const restored = restoreUserSnapshot(session.user.id);
        if (restored) {
          useAppStore.persist.rehydrate();
        }
        mmkv.set(LAST_USER_KEY, session.user.id);
        syncService.setUser(session.user.id);
        syncService.fullSync();
      } else if (event === "SIGNED_OUT") {
        nutritionQueue.clearAll();
        // Archive outgoing user's data before clearing
        const outgoingUserId = mmkv.getString(LAST_USER_KEY);
        if (outgoingUserId) {
          saveUserSnapshot(outgoingUserId);
        }
        syncService.setUser(null);
        useAppStore.getState().clearUserData();
        mmkv.remove(LAST_USER_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
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
