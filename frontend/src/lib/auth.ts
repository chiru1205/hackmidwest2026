/** Demo-level role mechanics (not real security). Two builds: citizen and city. */
export type Role = "citizen" | "city";

export const ROLE: Role = import.meta.env.VITE_ROLE === "city" ? "city" : "citizen";

const CITY_TOKEN: string = (import.meta.env.VITE_CITY_TOKEN as string | undefined) || "civicflow-city-demo";
const STAFF_PIN = "city";
const KEY = "cf_staff";

export const userId = (): string => {
  try { return localStorage.getItem("cf_user") || "u_you"; } catch { return "u_you"; }
};

let memUnlocked = false;

export function isStaffUnlocked(): boolean {
  if (ROLE !== "city") return false;
  try { return sessionStorage.getItem(KEY) === "1" || memUnlocked; } catch { return memUnlocked; }
}

export function unlockStaff(pin: string): boolean {
  if (pin.trim() !== STAFF_PIN) return false;
  memUnlocked = true;
  try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  return true;
}

export function lockStaff(): void {
  memUnlocked = false;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event("cf-locked"));
}

/** The staff token (city role only, once unlocked). */
export function staffToken(): string | null {
  return ROLE === "city" && isStaffUnlocked() ? CITY_TOKEN : null;
}

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "X-User-Id": userId() };
  const t = staffToken();
  if (t) h["X-Role-Token"] = t;
  return h;
}
