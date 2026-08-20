// =============================================================================
// config.js — cloud sync configuration.
//
// The publishable ("anon") key is SAFE to embed in a client app: Row-Level
// Security on the server is what actually protects the data. With no session,
// these requests can read/write nothing. Leaving the URL/KEY empty runs the app
// in local-only mode (no cloud) — the app works exactly the same either way.
//
// NOTE: never put the database password / connection string here — that grants
// full admin access and bypasses RLS. Only the publishable key belongs here.
// =============================================================================
export const SUPABASE_URL = "https://faudkiifhzswtgnttdmp.supabase.co";
export const SUPABASE_KEY = "sb_publishable_PQa-_rVo7_YJQZD1w7Swew_ySSHv3hX";
// Project ref — used to detect a stored session without loading the SDK.
export const SUPABASE_REF = "faudkiifhzswtgnttdmp";
