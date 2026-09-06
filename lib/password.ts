// Shared password policy for account creation and password changes.
// Requirements: min 8 chars, at least one uppercase, one lowercase, one number,
// and one special character. Enforced on sign-up, reset-password, and the
// settings "Change Password" form.

export const PASSWORD_MIN_LENGTH = 8

export interface PasswordCheck {
  minLength: boolean
  upper: boolean
  lower: boolean
  number: boolean
  special: boolean
}

export function checkPassword(pw: string): PasswordCheck {
  return {
    minLength: pw.length >= PASSWORD_MIN_LENGTH,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  }
}

export function isPasswordValid(pw: string): boolean {
  const c = checkPassword(pw)
  return c.minLength && c.upper && c.lower && c.number && c.special
}

/** Returns a user-facing error string, or null when the password satisfies the policy. */
export function passwordError(pw: string): string | null {
  return isPasswordValid(pw)
    ? null
    : "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character."
}

/** Ordered checklist used by the live requirements UI. */
export const PASSWORD_REQUIREMENTS: { key: keyof PasswordCheck; label: string }[] = [
  { key: "minLength", label: "At least 8 characters" },
  { key: "upper", label: "One uppercase letter (A–Z)" },
  { key: "lower", label: "One lowercase letter (a–z)" },
  { key: "number", label: "One number (0–9)" },
  { key: "special", label: "One special character (!@#$…)" },
]
