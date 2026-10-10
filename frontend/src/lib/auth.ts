/** Demo-level role mechanics (not real security). Two builds: citizen and city. */
export type Role = "citizen" | "city";

export const ROLE: Role = import.meta.env.VITE_ROLE === "city" ? "city" : "citizen";

const CITY_TOKEN: string = (import.meta.env.VITE_CITY_TOKEN as string | undefined) || "civicflow-city-demo";
const STAFF_PIN = "city";
const KEY = "cf_staff";

const USER_KEY = "cf_user";
const newUserId = (): string => {
  const b = new Uint8Array(4);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < 4; i++) b[i] = Math.floor(Math.random() * 256); }
  return "u_" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

let memUser: string | null = null;

/** Identity for this device: a fresh random id on first load; ?user=<id> switches to a seeded demo user (persisted). */
function initUser(): string {
  let id: string | null = null;
  try { id = localStorage.getItem(USER_KEY); } catch { /* ignore */ }
  if (ROLE === "citizen") {
    try {
      const sp = new URLSearchParams(window.location.search);
      const u = sp.get("user");
      if (u && /^[A-Za-z0-9_-]{1,40}$/.test(u)) id = u;
      else if (sp.get("newuser") === "1" && !sessionStorage.getItem("cf_newuser_done")) {
        sessionStorage.setItem("cf_newuser_done", "1");
        id = newUserId();
        clearCitizenCaches();
      }
    } catch { /* ignore */ }
  }
  if (!id) id = ROLE === "city" ? "u_you" : newUserId();
  try { localStorage.setItem(USER_KEY, id); } catch { /* ignore */ }
  return id;
}

export const userId = (): string => {
  if (memUser === null) memUser = initUser();
  return memUser;
};

/** Forget everything cached for the current citizen on this device. */
export function clearCitizenCaches(): void {
  try {
    ["cf_fixed_seen", "cf_loc", "cf_my_requests"].forEach((k) => localStorage.removeItem(k));
    ["cf_loc", "cf_demo"].forEach((k) => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}

/** Start over as a brand-new citizen (new id, empty caches). Returns the new id. */
export function startNewCitizen(): string {
  memUser = newUserId();
  try { localStorage.setItem(USER_KEY, memUser); } catch { /* ignore */ }
  clearCitizenCaches();
  return memUser;
}

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
