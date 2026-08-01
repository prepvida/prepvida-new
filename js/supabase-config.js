// =====================================================================
// SUPABASE CONFIG
// Paste your own values below. Find them in:
// Supabase Dashboard -> Project Settings -> API
// =====================================================================

const SUPABASE_URL = "https://gzpjxoloptjygbfjycsr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6cGp4b2xvcHRqeWdiZmp5Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMTk3OTQsImV4cCI6MjEwMDg5NTc5NH0.G0GjztI-kuA27aYpcvFIG2WX7VJ0Y5TAasGRewEgXuU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
