const KEY = "cinesquad:device:v1";

/** A stable id for this browser, persisted across all sessions (not tied to
 * any one party) -- lets the backend recognize "this same device already
 * has a seat in this session" and avoid creating a duplicate participant
 * when the join form gets resubmitted (back button, refresh, etc). */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
