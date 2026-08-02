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
const monitoringNote = document.getElementById("monitoring-note");

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
let transcriptLines = []; // plain text log, used to build the PDF report

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
    .select("id, company_name, role_name, resume_text")
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
    .select("id, credits_remaining, status, subscription_plans(name, interview_mode)")
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

  const { data, error } = await supabaseClient.rpc("deduct_interview_credit", {
    subscription_id: activeSubscription.id
  });

  if (error || !data) {
    console.error(error);
    return false;
  }
  activeSubscription.credits_remaining -= 1;
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

// ---------- Behavior monitoring (Premium plan only) ----------
// Uses face-api.js to periodically check the webcam feed for: no face
// present (candidate left frame) or multiple faces (someone else in
// frame). This is best-effort — if the library fails to load for any
// reason, monitoring simply doesn't run and the interview continues
// normally without it.

let monitoringInterval = null;
let faceModelsLoaded = false;
let noFaceCount = 0;
let multiFaceCount = 0;
let totalChecks = 0;

async function loadFaceModels() {
  if (typeof faceapi === "undefined") {
    console.warn("face-api.js did not load — behavior monitoring disabled.");
    return false;
  }
  try {
    const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    return true;
  } catch (err) {
    console.warn("Could not load face detection models:", err);
    return false;
  }
}

function startBehaviorMonitoring() {
  if (!faceModelsLoaded || !studentWebcam.srcObject) return;

  monitoringNote.style.display = "block";
  noFaceCount = 0;
  multiFaceCount = 0;
  totalChecks = 0;

  monitoringInterval = setInterval(async () => {
    try {
      const detections = await faceapi.detectAllFaces(
        studentWebcam,
        new faceapi.TinyFaceDetectorOptions()
      );
      totalChecks++;
      if (detections.length === 0) noFaceCount++;
      if (detections.length > 1) multiFaceCount++;
    } catch (err) {
      console.warn("Face check failed:", err);
    }
  }, 4000); // check every 4 seconds — light enough not to affect performance
}

function stopBehaviorMonitoringAndGetSummary() {
  if (monitoringInterval) clearInterval(monitoringInterval);
  monitoringInterval = null;
  monitoringNote.style.display = "none";

  if (totalChecks === 0) return { flag: false, notes: null };

  const noFaceRatio = noFaceCount / totalChecks;
  const flags = [];
  if (noFaceRatio > 0.25) {
    flags.push(`Candidate was out of frame for approximately ${Math.round(noFaceRatio * 100)}% of the interview.`);
  }
  if (multiFaceCount > 0) {
    flags.push(`Multiple faces were detected in frame ${multiFaceCount} time(s) during the interview.`);
  }

  return {
    flag: flags.length > 0,
    notes: flags.length > 0 ? flags.join(" ") : "No irregular behavior detected."
  };
}
  if (studentWebcam.srcObject) {
    studentWebcam.srcObject.getTracks().forEach((track) => track.stop());
    studentWebcam.srcObject = null;
  }
}

// ---------- Video recording (Premium plan only) ----------
let mediaRecorder = null;
let recordedChunks = [];

function startVideoRecording() {
  if (!studentWebcam.srcObject) return; // no camera, nothing to record
  recordedChunks = [];
  try {
    mediaRecorder = new MediaRecorder(studentWebcam.srcObject, { mimeType: "video/webm" });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.start();
  } catch (err) {
    console.warn("Could not start video recording:", err);
  }
}

async function stopAndUploadVideoRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return null;

  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(recordedChunks, { type: "video/webm" });
        const fileName = `${currentUser.id}/${currentSessionId || Date.now()}.webm`;

        const { error: uploadError } = await supabaseClient.storage
          .from("interview-recordings")
          .upload(fileName, blob, { contentType: "video/webm" });

        if (uploadError) {
          console.error("Video upload failed:", uploadError);
          resolve(null);
          return;
        }

        // Bucket is private — store the path only; signed links are
        // generated fresh (and briefly) whenever someone views the dashboard.
        resolve(fileName);
      } catch (err) {
        console.error("Video processing failed:", err);
        resolve(null);
      }
    };
    mediaRecorder.stop();
  });
}

function stopWebcamPreview() {
  if (studentWebcam.srcObject) {
    studentWebcam.srcObject.getTracks().forEach((track) => track.stop());
    studentWebcam.srcObject = null;
  }
}

// ---------- PDF Interview Report ----------
// Generates a branded PDF summary (company/role, date, full transcript),
// triggers a download for the student, and uploads a copy to Supabase
// Storage so it's retrievable later from the dashboard.
async function generateAndUploadReport() {
  if (typeof window.jspdf === "undefined") {
    console.warn("jsPDF did not load — skipping report generation.");
    return null;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("PrepVida — Interview Report", margin, y);
    y += 10;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Summary details
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const summaryLines = [
      `Candidate: ${currentUser.email || "N/A"}`,
      `Dream Company: ${dreamSelection?.company_name || "N/A"}`,
      `Dream Role: ${dreamSelection?.role_name || "N/A"}`,
      `Date: ${dateStr}`
    ];
    summaryLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 7;
    });
    y += 5;

    // Transcript section
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Full Transcript", margin, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const maxWidth = pageWidth - margin * 2;
    const pageHeight = doc.internal.pageSize.getHeight();

    transcriptLines.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, maxWidth);
      wrapped.forEach((wrappedLine) => {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 20;
        }
        doc.text(wrappedLine, margin, y);
        y += 6;
      });
      y += 2;
    });

    // Footer note
    if (y > pageHeight - 20) { doc.addPage(); y = 20; }
    y += 10;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Generated by PrepVida.in — AI Interview Practice", margin, pageHeight - 10);

    // Trigger download for the student
    const fileName = `PrepVida-Interview-${dreamSelection?.company_name || "Report"}.pdf`;
    doc.save(fileName);

    // Also upload a copy to Supabase Storage for later retrieval
    const pdfBlob = doc.output("blob");
    const storagePath = `${currentUser.id}/${currentSessionId || Date.now()}.pdf`;

    const { error: uploadError } = await supabaseClient.storage
      .from("interview-reports")
      .upload(storagePath, pdfBlob, { contentType: "application/pdf" });

    if (uploadError) {
      console.error("Report upload failed:", uploadError);
      return null;
    }

    return storagePath;
  } catch (err) {
    console.error("PDF generation failed:", err);
    return null;
  }
}

function addTranscriptLine(speaker, text) {
  transcriptBox.style.display = "block";
  const line = document.createElement("div");
  line.style.marginBottom = "0.5rem";
  line.innerHTML = `<strong>${speaker}:</strong> ${text}`;
  transcriptBox.appendChild(line);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
  transcriptLines.push(`${speaker}: ${text}`);
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

    // Video recording is a Premium-plan feature only
    if (activeSubscription?.subscription_plans?.interview_mode === "video_ai_avatar") {
      startVideoRecording();
      startBehaviorMonitoring();
    }
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
    callStatus.textContent = "Interview ended. Processing your results...";
    endBtn.style.display = "none";
    avatarCircle.classList.remove("speaking");
    stopCallTimer();

    // Upload video recording first (Premium plan), if one was made
    let videoUrl = null;
    let behaviorSummary = { flag: false, notes: null };
    if (activeSubscription?.subscription_plans?.interview_mode === "video_ai_avatar") {
      behaviorSummary = stopBehaviorMonitoringAndGetSummary();
      videoUrl = await stopAndUploadVideoRecording();
    }
    stopWebcamPreview();

    // Generate the PDF report (all plans) — downloads for the student
    // and saves a copy for later retrieval from the dashboard.
    const reportPath = await generateAndUploadReport();

    if (currentSessionId) {
      const updates = { status: "completed", completed_at: new Date().toISOString() };
      if (videoUrl) updates.video_recording_url = videoUrl;
      if (reportPath) updates.report_url = reportPath;
      if (behaviorSummary.notes) {
        updates.fraud_flag = behaviorSummary.flag;
        updates.fraud_notes = behaviorSummary.notes;
      }
      await supabaseClient.from("interview_sessions").update(updates).eq("id", currentSessionId);
    }

    callStatus.textContent = "Interview ended. Your scoreboard will be emailed to you shortly.";
    startBtn.style.display = activeSubscription.credits_remaining > 0 ? "inline-block" : "none";
    startBtn.disabled = false;
    // NOTE: actual scoring happens via Vapi.ai's Analysis Plan + a
    // webhook (e.g. to Zapier) that emails the student. See README.
  });

  vapi.start(VAPI_ASSISTANT_ID, {
    variableValues: {
      dream_company: dreamSelection.company_name || "",
      dream_role: dreamSelection.role_name || "",
      student_email: currentUser.email || "",
      resume_summary: dreamSelection.resume_text || "No resume provided."
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

  // Preload face detection models early (Premium only) so they're
  // ready by the time the call actually starts
  if (activeSubscription?.subscription_plans?.interview_mode === "video_ai_avatar") {
    faceModelsLoaded = await loadFaceModels();
  }
})();
