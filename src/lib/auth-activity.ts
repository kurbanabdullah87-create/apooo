const activityKey = (userId: string) => `saha:last-activity:${userId}`;

export function markUserActivity(userId: string, at = Date.now()) {
  try {
    localStorage.setItem(activityKey(userId), String(at));
  } catch {
    // The auth session remains usable if browser storage is unavailable.
  }
}

export function readUserActivity(userId: string) {
  try {
    const value = Number(localStorage.getItem(activityKey(userId)) ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}
