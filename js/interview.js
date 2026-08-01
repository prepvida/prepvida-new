// =====================================================================
// INTERVIEW PAGE LOGIC — Vapi.ai Web SDK + plan credit enforcement
// Uses the Vapi class directly (via a plain-browser UMD build) instead
// of the official widget component, which has a known bug that breaks
// assistant-overrides (personalization) requests.
// =====================================================================

const VAPI_PUBLIC_KEY = "f669166b-f926-4d68-90a3-0ed7461ecaef";
const VAPI_ASSISTANT_ID = "6b84ec28-24b9-4478-b3e6-0604a9093d73";
// =====================================================================

const startBtn = document.getElementById("start-call-btn");
const endBtn = document.getElementById("end-call-btn");
const callStatus = document.getElementById("call-status");
const interviewTitle = document.getElementById("interview-title");
const interviewSubtitle = document.getElementById("interview-subtitle");
const creditsNote = document.getElementById("credits-note");
const avatarCircle = document.getElementById("avatar-circle");
const studentWebcam = document.getElementById("student-webcam");
const webcamFallback = document.getElementById("webcam-fallback");
const transcriptBox = document.getElementById("transcript-box");
const callTimer = document.getElementById("call-timer");

const MAX_CALL_SECONDS = 20 * 60; // matches the 20-min limit set on the Vapi assistant
let timerInterval = null;

function startCallTimer() {
  let secondsLeft = MAX_CALL_SECONDS;
  callTimer.style.display = "block";
  updateTimerDisplay(secondsLeft);
  timerInterval = setInterval(() => {
    secondsLeft--;
    updateTimerDisplay(secondsLeft);
    if (secondsLeft <= 0) stopCallTimer();
  }, 1000);
}

function updateTimerDisplay(secondsLeft) {
  const mins = Math.max(0, Math.floor(secondsLeft / 60));
  const secs = Math.max(0, secondsLeft % 60);
  callTimer.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
}

function stopCallTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  callTimer.style.display = "none";
}

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
    .gt("credits_remaining", 0);

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

async function startWebcamPreview() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    studentWebcam.srcObject = stream;
    webcamFallback.style.display = "none";
  } catch (err) {
    console.warn("Webcam not available:", err);
    webcamFallback.style.display = "block";
  }
}

function stopWebcamPreview() {
  if (studentWebcam.srcObject) {
    studentWebcam.srcObject.getTracks().forEach((track) => track.stop());
    studentWebcam.srcObject = null;
  }
}

function addTranscriptLine(speaker, text) {
  transcriptBox.style.display = "block";
  const line = document.createElement("div");
  line.style.marginBottom = "0.5rem";
  line.innerHTML = `<strong>${speaker}:</strong> ${text}`;
  transcriptBox.appendChild(line);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

startBtn.addEventListener("click", async () => {
  if (!dreamSelection || !activeSubscription) return;
  if (startBtn.disabled) return; // guard against double-clicks
  startBtn.disabled = true;

  await startWebcamPreview();
  callStatus.textContent = "Connecting to your AI interviewer...";

  vapi = new Vapi(VAPI_PUBLIC_KEY);
  let creditDeducted = false;

  vapi.on("call-start", async () => {
    // Only deduct the credit once the call has actually connected —
    // a failed connection attempt should never cost the student a credit.
    if (!creditDeducted) {
      const deducted = await deductOneCredit();
      if (deducted) {
        creditDeducted = true;
        currentSessionId = await createSessionRow();
        creditsNote.textContent = `${activeSubscription.credits_remaining} interview${activeSubscription.credits_remaining === 1 ? "" : "s"} remaining on your plan.`;
      }
    }
    callStatus.textContent = "Interview in progress. Speak naturally.";
    startBtn.style.display = "none";
    endBtn.style.display = "inline-block";
    startCallTimer();
  });

  vapi.on("speech-start", () => {
    avatarCircle.classList.add("speaking");
  });
  vapi.on("speech-end", () => {
    avatarCircle.classList.remove("speaking");
  });

  // Live transcript, if the SDK provides message events
  vapi.on("message", (msg) => {
    if (msg?.type === "transcript" && msg?.transcriptType === "final") {
      const speaker = msg.role === "assistant" ? "Interviewer" : "You";
      addTranscriptLine(speaker, msg.transcript);
    }
  });

  vapi.on("error", (err) => {
    console.error("Vapi error:", err);
    const message = err?.error?.message || err?.errorMsg || err?.message || "Unknown error";
    callStatus.textContent = "Could not connect: " + message;
    startBtn.style.display = "inline-block";
    startBtn.disabled = false;
    endBtn.style.display = "none";
  });

  vapi.on("call-end", async () => {
    callStatus.textContent = "Interview ended. Your scoreboard will be emailed to you shortly.";
    endBtn.style.display = "none";
    startBtn.style.display = activeSubscription.credits_remaining > 0 ? "inline-block" : "none";
    startBtn.disabled = false;
    avatarCircle.classList.remove("speaking");
    stopWebcamPreview();
    stopCallTimer();
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
