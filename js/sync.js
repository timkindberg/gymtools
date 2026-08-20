// =============================================================================
// sync.js — optional cloud sync via Supabase.
//
// Strategy (deliberately simple for a single user): the whole app-state JSON is
// one row per user in the `app_state` table. On sign-in we merge by timestamp
// (last-write-wins on the whole doc); after that, local saves push (debounced)
// and we pull on load. Everything is additive and guarded — if not signed in,
// or if anything here throws, the app just runs local-only.
//
// The Supabase SDK is loaded from a CDN only when actually needed, so local-only
// users never fetch it.
// =============================================================================
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_REF } from "./config.js";

let sb = null;
let sdkPromise = null;

// Load the self-contained UMD build (vendored locally — no CDN dependency,
// works offline once cached) on demand, exposing window.supabase.
function loadSdk() {
  if (typeof window !== "undefined" && window.supabase) return Promise.resolve(window.supabase);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "./js/vendor/supabase.umd.js";
    s.async = true;
    s.onload = () => (window.supabase ? resolve(window.supabase) : reject(new Error("supabase global missing")));
    s.onerror = () => reject(new Error("failed to load supabase sdk"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export function configured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

// True if a Supabase session is stored locally — lets us skip loading the SDK
// entirely for users who never signed in.
export function hasStoredSession() {
  if (!configured()) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-" + SUPABASE_REF) && k.endsWith("-auth-token")) return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

async function client() {
  if (sb) return sb;
  const S = await loadSdk();
  sb = S.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return sb;
}

export async function currentUser() {
  if (!configured()) return null;
  try {
    const c = await client();
    const { data } = await c.auth.getUser();
    return data && data.user ? data.user : null;
  } catch (e) { return null; }
}

// Email + password auth — no confirmation emails, works in an installed PWA.
export async function signUp(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  // No session means "Confirm email" is still enabled in Supabase.
  if (!data.session) throw new Error("no-session");
  return data.user;
}

export async function signInPassword(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  try { const c = await client(); await c.auth.signOut(); } catch (e) { /* ignore */ }
}

// Fetch the remote snapshot: { data, updated_at } or null if none yet.
export async function pull(userId) {
  const c = await client();
  const { data, error } = await c.from("app_state").select("data, updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data || null;
}

// Upsert the local snapshot.
export async function push(userId, data, updatedAt) {
  const c = await client();
  const { error } = await c.from("app_state").upsert(
    { user_id: userId, data, updated_at: updatedAt || new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}
