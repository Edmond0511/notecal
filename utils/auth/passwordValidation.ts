// Password and email validation helpers used by the email/password auth screens.
//
// Password rule is intentionally minimal (NIST SP 800-63B): length-only, no
// character-class requirements. Long-but-simple beats short-but-complex.
// Supabase enforces a min of 6 server-side; we set our floor at 8 for client
// guidance.

const MIN_PASSWORD_LENGTH = 8;

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export function validatePassword(password: string): ValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, message: `At least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  return { valid: true };
}

// Pragmatic email regex. Not RFC 5322 — that would reject many "weird but valid"
// addresses. The real validation happens server-side; this is a typo-catcher to
// disable the submit button before the user fires a doomed network request.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim();
  if (!trimmed) return { valid: false };
  if (!trimmed.includes("@")) {
    return { valid: false, message: "Looks like that email is missing an @." };
  }
  if (!EMAIL_RE.test(trimmed)) {
    return { valid: false, message: "Enter a valid email." };
  }
  return { valid: true };
}

// OAuth gives us a display name automatically; email signup doesn't, so we
// derive a sensible default from the local-part. The user can edit this later
// in Settings → Profile.
//
// Examples:
//   "edmond.yang@gmail.com"  → "Edmond Yang"
//   "ed_yang+work@notecal.app" → "Ed Yang Work"
//   "x@y.z"                  → "X"
//   ""                       → "There"  (graceful fallback)
export function deriveDisplayName(email: string): string {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  const cleaned = local
    .replace(/\+.*/, "")            // strip Gmail-style tags
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "There";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Mask an email for inline UX ("we sent a link to e***@gmail.com"). We don't
// disclose more than the first character of the local-part, which is enough
// for the user to recognise their own address without exposing it to a
// shoulder-surfer.
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  const visible = local.charAt(0);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 1))}${domain}`;
}
