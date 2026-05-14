// Wraps the auth-precheck edge function. Returns whether an email is already
// registered and which providers are linked to it, so the sign-up form can
// render a friendly "Continue with Google" redirect (Pattern A) instead of
// the bare Supabase "user already exists" error.
//
// Fail-open: any network or server error returns { exists: false, providers: [] }
// so the caller proceeds with the real signUp/signInWithPassword call. The
// real Supabase response will catch genuine collisions; precheck is a UX
// nicety, not the correctness boundary.

import { supabase } from "@/lib/supabase";

export type AuthProvider = "email" | "google" | "apple";

export interface PrecheckResult {
  exists: boolean;
  providers: AuthProvider[];
}

const FAIL_OPEN: PrecheckResult = { exists: false, providers: [] };

export async function precheckEmail(email: string): Promise<PrecheckResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return FAIL_OPEN;

  try {
    const { data, error } = await supabase.functions.invoke("auth-precheck", {
      body: { email: normalized },
    });
    if (error || !data) return FAIL_OPEN;

    const exists = Boolean((data as { exists?: unknown }).exists);
    const rawProviders = (data as { providers?: unknown }).providers;
    const providers: AuthProvider[] = Array.isArray(rawProviders)
      ? rawProviders.filter(
          (p): p is AuthProvider =>
            p === "email" || p === "google" || p === "apple",
        )
      : [];
    return { exists, providers };
  } catch {
    return FAIL_OPEN;
  }
}

// Convenience helper for the redirect-to-OAuth UX. Returns the OAuth provider
// name if the email belongs to an OAuth-only account; null otherwise.
export function oauthRedirectProvider(
  result: PrecheckResult,
): "google" | "apple" | null {
  if (!result.exists) return null;
  if (result.providers.includes("google")) return "google";
  if (result.providers.includes("apple")) return "apple";
  return null;
}
