export const MONITORED_EMAILS = ["garvcontact30@gmail.com", "gauravcontact66@gmail.com"] as const;

const monitoredEmailSet = new Set<string>(MONITORED_EMAILS);

export function isMonitoredUserEmail(email: string | null | undefined): boolean {
  return Boolean(email && monitoredEmailSet.has(email.toLowerCase()));
}
