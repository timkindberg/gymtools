// =============================================================================
// config.js — cloud sync configuration.
//
// The publishable ("anon") key is SAFE to embed in a client app: Row-Level
// Security on the server is what actually protects the data. With no session,
// these requests can read/write nothing. Leaving the URL/KEY empty runs the app
// in local-only mode (no cloud) — the app works exactly the same either way.
// =============================================================================
export const SUPABASE_URL = "https://nkzwschaooasinmxknip.supabase.co";
export const SUPABASE_KEY = "sb_publishable_aGmHyE2CQj8mxoqJVpCeCw_sSyXHW4Y";
// Project ref — used to detect a stored session without loading the SDK.
export const SUPABASE_REF = "nkzwschaooasinmxknip";
