// =====================================================================
// SUPABASE CONFIG
// Paste your own values below. Find them in:
// Supabase Dashboard -> Project Settings -> API
// =====================================================================

const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
