export const SUPER_ADMIN_EMAIL = "garvcontact30@gmail.com";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailsFrom(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

export function superAdminEmails(): Set<string> {
  return new Set([
    normalizeEmail(SUPER_ADMIN_EMAIL),
    ...emailsFrom(process.env.SUPER_ADMIN_EMAIL),
    ...emailsFrom(process.env.SUPER_ADMIN_EMAILS),
  ]);
}

export function adminEmails(): Set<string> {
  return new Set([...emailsFrom(process.env.ADMIN_EMAILS), ...superAdminEmails()]);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && superAdminEmails().has(normalizeEmail(email)));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && adminEmails().has(normalizeEmail(email)));
}
