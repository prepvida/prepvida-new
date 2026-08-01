// =====================================================================
// INTERVIEW PAGE LOGIC — Vapi.ai integration
// =====================================================================
// FILL THESE IN from your Vapi.ai dashboard (vapi.ai -> API Keys):
const VAPI_PUBLIC_KEY = "PASTE_YOUR_VAPI_PUBLIC_KEY_HERE";
const VAPI_ASSISTANT_ID = "PASTE_YOUR_VAPI_ASSISTANT_ID_HERE";
// =====================================================================

const startBtn = document.getElementById("start-call-btn");
const endBtn = document.getElementById("end-call-btn");
const callStatus = document.getElementById("call-status");
const interviewTitle = document.getElementById("interview-title");
const interviewSubtitle = document.getElementById("interview-subtitle");

let currentUser = null;
let dreamSelection = null;
let currentSessionId = null;
let vapi = null;

async function requireLogin() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session.user;
}

async function loadDreamSelection() {
  const { data, error } = await supabaseClient
    .from("dream_selections")
    .select("id, company_id, role_id, companies(name), roles(role_name)")
    .eq("user_id", currentUser.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    interviewTitle.textContent = "No dream company/role selected yet";
    interviewSubtitle.innerHTML = 'Please <a href="dream-selection.html">choose your dream company and role</a> first.';
    startBtn.disabled = true;
    return null;
  }

  interviewTitle.textContent = `Interviewing for ${data.roles?.role_name || "your role"}`;
  interviewSubtitle.textContent = `Company focus: ${data.companies?.name || "N/A"}`;
  return data;
}

async function createSessionRow() {
  const { data, error } = await supabaseClient
    .from("interview_sessions")
    .insert({
      user_id: currentUser.id,
      dream_selection_id: dreamSelection.id,
      round_type: "General",
      interview_mode: "voice",
      status: "in_progress"
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return null;
  }
  return data.id;
}

async function markSessionCompleted() {
  if (!currentSessionId) return;
  await supabaseClient
    .from("interview_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", currentSessionId);
}

startBtn.addEventListener("click", async () => {
  if (!dreamSelection) return;

  currentSessionId = await createSessionRow();
  callStatus.textContent = "Connecting to your AI interviewer...";

  vapi = new window.Vapi(VAPI_PUBLIC_KEY);

  vapi.on("call-start", () => {
    callStatus.textContent = "Interview in progress. Speak naturally.";
    startBtn.style.display = "none";
    endBtn.style.display = "inline-block";
  });

  vapi.on("call-end", async () => {
    callStatus.textContent = "Interview ended. Your scoreboard will be emailed to you shortly.";
    endBtn.style.display = "none";
    await markSessionCompleted();
    // NOTE: actual scoring happens server-side via a Supabase Edge
    // Function triggered by a Vapi.ai webhook once the call ends.
    // See project README for setting that up.
  });

  vapi.start(VAPI_ASSISTANT_ID, {
    variableValues: {
      dream_company: dreamSelection.companies?.name || "",
      dream_role: dreamSelection.roles?.role_name || ""
    }
  });
});

endBtn.addEventListener("click", () => {
  if (vapi) vapi.stop();
});

(async () => {
  currentUser = await requireLogin();
  if (!currentUser) return;
  dreamSelection = await loadDreamSelection();
})();
