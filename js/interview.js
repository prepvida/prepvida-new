// =====================================================================
// INTERVIEW PAGE LOGIC — Vapi.ai integration + plan credit enforcement
// This file loads as an ES module (see interview.html), which is what
// lets us properly import the Vapi library — a plain <script> tag
// cannot load it correctly.
// =====================================================================
import Vapi from "https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest/+esm";

// FILL THESE IN from your Vapi.ai dashboard (vapi.ai -> API Keys):
const VAPI_PUBLIC_KEY = "f669166b-f926-4d68-90a3-0ed7461ecaef";
const VAPI_ASSISTANT_ID = "a31e5c43-af58-4cf2-8d01-eeae23877f5c";
// =====================================================================

const startBtn = document.getElementById("start-call-btn");
const endBtn = document.getElementById("end-call-btn");
const callStatus = document.getElementById("call-status");
const interviewTitle = document.getElementById("interview-title");
const interviewSubtitle = document.getElementById("interview-subtitle");
const creditsNote = document.getElementById("credits-note");

let currentUser = null;
let dreamSelection = null;
let currentSessionId = null;
let activeSubscription = null;
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
    .select("id, company_name, role_name")
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

  interviewTitle.textContent = `Interviewing for ${data.role_name || "your role"}`;
  interviewSubtitle.textContent = `Company focus: ${data.company_name || "N/A"}`;
  return data;
}

// Checks the student's active subscription and remaining interview credits.
// Blocks the Start button if there's no active plan or credits are used up.
async function loadSubscriptionCredits() {
  const { data, error } = await supabaseClient
    .from("user_subscriptions")
    .select("id, credits_remaining, status, subscription_plans(name)")
    .eq("user_id", currentUser.id)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    creditsNote.innerHTML = 'You don\'t have an active plan yet. <a href="pricing.html">Choose a plan</a> to start interviewing.';
    creditsNote.style.display = "block";
    startBtn.disabled = true;
    return null;
  }

  if (data.credits_remaining <= 0) {
    creditsNote.innerHTML = `You've used all your interviews on the ${data.subscription_plans?.name || "current"} plan. <a href="pricing.html">Upgrade or renew</a> to continue.`;
    creditsNote.style.display = "block";
    startBtn.disabled = true;
    return null;
  }

  creditsNote.textContent = `${data.credits_remaining} interview${data.credits_remaining === 1 ? "" : "s"} remaining on your ${data.subscription_plans?.name || "current"} plan.`;
  creditsNote.style.display = "block";
  return data;
}

async function deductOneCredit() {
  if (!activeSubscription) return false;
  const newCount = activeSubscription.credits_remaining - 1;

  const { error } = await supabaseClient
    .from("user_subscriptions")
    .update({ credits_remaining: newCount })
    .eq("id", activeSubscription.id)
    .gt("credits_remaining", 0); // safety: only deduct if still > 0

  if (error) {
    console.error(error);
    return false;
  }
  activeSubscription.credits_remaining = newCount;
  return true;
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
  if (!dreamSelection || !activeSubscription) return;

  const deducted = await deductOneCredit();
  if (!deducted) {
    callStatus.textContent = "Could not start — no interview credits available.";
    return;
  }

  currentSessionId = await createSessionRow();
  callStatus.textContent = "Connecting to your AI interviewer...";
  creditsNote.textContent = `${activeSubscription.credits_remaining} interview${activeSubscription.credits_remaining === 1 ? "" : "s"} remaining on your plan.`;

  vapi = new Vapi(VAPI_PUBLIC_KEY);

  vapi.on("call-start", () => {
    callStatus.textContent = "Interview in progress. Speak naturally.";
    startBtn.style.display = "none";
    endBtn.style.display = "inline-block";
  });

  vapi.on("call-end", async () => {
    callStatus.textContent = "Interview ended. Your scoreboard will be emailed to you shortly.";
    endBtn.style.display = "none";
    startBtn.style.display = activeSubscription.credits_remaining > 0 ? "inline-block" : "none";
    await markSessionCompleted();
    // NOTE: actual scoring happens via Vapi.ai's Analysis Plan + a
    // webhook (e.g. to Zapier) that emails the student. See README.
  });

  vapi.start(VAPI_ASSISTANT_ID, {
    variableValues: {
      dream_company: dreamSelection.company_name || "",
      dream_role: dreamSelection.role_name || ""
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
  activeSubscription = await loadSubscriptionCredits();
  if (!activeSubscription) startBtn.disabled = true;
})();
