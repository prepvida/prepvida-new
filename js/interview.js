// =====================================================================
// INTERVIEW PAGE LOGIC — Vapi.ai official widget + plan credit enforcement
// Uses the <vapi-widget> custom element (loaded via widget.umd.js in
// interview.html) instead of manually driving the Vapi class — this is
// Vapi's own officially maintained, plain-HTML-friendly integration.
// =====================================================================

// FILL THESE IN from your Vapi.ai dashboard (vapi.ai -> API Keys):
const VAPI_PUBLIC_KEY = "f669166b-f926-4d68-90a3-0ed7461ecaef";
const VAPI_ASSISTANT_ID = "6b84ec28-24b9-4478-b3e6-0604a9093d73";
// =====================================================================

const callStatus = document.getElementById("call-status");
const interviewTitle = document.getElementById("interview-title");
const interviewSubtitle = document.getElementById("interview-subtitle");
const creditsNote = document.getElementById("credits-note");
const avatarCircle = document.getElementById("avatar-circle");
const studentWebcam = document.getElementById("student-webcam");
const webcamFallback = document.getElementById("webcam-fallback");
const widgetContainer = document.getElementById("vapi-widget-container");

let currentUser = null;
let dreamSelection = null;
let currentSessionId = null;
let activeSubscription = null;

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
    return null;
  }

  if (data.credits_remaining <= 0) {
    creditsNote.innerHTML = `You've used all your interviews on the ${data.subscription_plans?.name || "current"} plan. <a href="pricing.html">Upgrade or renew</a> to continue.`;
    creditsNote.style.display = "block";
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

// Renders the official Vapi widget as a plain custom element — this
// handles the actual call connection reliably, no manual SDK wiring.
// IMPORTANT: the widget script scans the page for <vapi-widget> tags
// ONCE when it loads, so the element must already exist in the DOM
// BEFORE the script is added — hence we load the script dynamically
// here, after inserting the element, rather than via a static <script>
// tag in the HTML head.
function renderVapiWidget() {
  const widget = document.createElement("vapi-widget");
  widget.setAttribute("public-key", VAPI_PUBLIC_KEY);
  widget.setAttribute("assistant-id", VAPI_ASSISTANT_ID);
  widget.setAttribute("mode", "voice");
  widget.setAttribute("size", "full");
  widget.setAttribute("theme", "light");
  widget.setAttribute("accent-color", "#C79A3E");
  widget.setAttribute("cta-button-color", "#10192B");
  widget.setAttribute("cta-button-text-color", "#F6F3EC");
  widget.setAttribute("start-button-text", "Start Interview");
  widget.setAttribute("end-button-text", "End Interview");
  widget.setAttribute("show-transcript", "true");
  widget.setAttribute("title", "AI Interviewer");
  widget.setAttribute("assistant-overrides", JSON.stringify({
    variableValues: {
      dream_company: dreamSelection.company_name || "",
      dream_role: dreamSelection.role_name || ""
    }
  }));

  // Best-effort event hooks (widget-provided callbacks)
  widget.onVoiceStart = () => {
    callStatus.textContent = "Interview in progress. Speak naturally.";
    avatarCircle.classList.add("speaking");
  };

  widget.onVoiceEnd = async () => {
    callStatus.textContent = "Interview ended. Your scoreboard will be emailed to you shortly.";
    avatarCircle.classList.remove("speaking");
    stopWebcamPreview();
    await markSessionCompleted();
  };

  widget.onError = (err) => {
    console.error("Vapi widget error:", err);
    callStatus.textContent = "Could not connect: " + (err?.message || "Unknown error");
  };

  widgetContainer.innerHTML = "";
  widgetContainer.appendChild(widget);

  // NOW load the widget script — after the element is already in the DOM
  const script = document.createElement("script");
  script.src = "https://unpkg.com/@vapi-ai/client-sdk-react/dist/embed/widget.umd.js";
  script.onload = () => {
    callStatus.textContent = "Ready — click Start Interview below.";
  };
  script.onerror = () => {
    callStatus.textContent = "Could not load the interview widget. Please refresh and try again.";
  };
  document.body.appendChild(script);
}

(async () => {
  currentUser = await requireLogin();
  if (!currentUser) return;

  dreamSelection = await loadDreamSelection();
  activeSubscription = await loadSubscriptionCredits();

  if (!dreamSelection || !activeSubscription) {
    callStatus.textContent = "Cannot start yet — see message above.";
    return;
  }

  // Reserve this interview: deduct credit, log session, then show the widget
  const deducted = await deductOneCredit();
  if (!deducted) {
    callStatus.textContent = "Could not reserve an interview slot. Please refresh and try again.";
    return;
  }
  currentSessionId = await createSessionRow();
  creditsNote.textContent = `${activeSubscription.credits_remaining} interview${activeSubscription.credits_remaining === 1 ? "" : "s"} remaining on your plan.`;

  await startWebcamPreview();
  renderVapiWidget();
})();
