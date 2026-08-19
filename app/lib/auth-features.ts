/**
 * Switches for auth surfaces that are built but not currently offered.
 *
 * In its own module rather than as a constant inside `../components/auth-form` for one reason: a
 * flag hidden in a 1,000-line client component is a flag nobody finds when they come looking for
 * why a feature is missing, and a test cannot swap it out to keep exercising the code behind it.
 *
 * Nothing here has imports, so both sides of the RSC boundary can read it.
 */

/**
 * Whether the sign-in form offers "Forgot password?".
 *
 * Off. The self-service reset itself is untouched — `app/api/auth/forgot-password` and
 * `app/api/auth/reset-password` still work, and the two-step panel in the form is still written —
 * only the entry point is withheld. Flip this back to `true` to offer it again; nothing else has
 * to change.
 */
export const PASSWORD_RECOVERY_ENABLED = false;
