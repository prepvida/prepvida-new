// =====================================================================
// DASHBOARD LOGIC
// =====================================================================

const welcomeLine = document.getElementById("welcome-line");
const statTotal = document.getElementById("stat-total");
const statAvg = document.getElementById("stat-avg");
const statBest = document.getElementById("stat-best");
const sessionsContainer = document.getElementById("sessions-container");
const logoutLink = document.getElementById("logout-link");

let currentUser = null;

async function requireLogin() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session.user;
}

async function loadProfile() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("full_name")
    .eq("id", currentUser.id)
    .maybeSingle();

  welcomeLine.textContent = `Welcome back${data?.full_name ? ", " + data.full_name : ""}. Here's everything so far.`;
}

async function loadSessionsAndScores() {
  const { data: sessions, error } = await supabaseClient
    .from("interview_sessions")
    .select("id, round_type, interview_mode, status, started_at, completed_at, report_url, video_recording_url, dream_selections(company_name, role_name), interview_scores(score, max_score, metric_name)")
    .eq("user_id", currentUser.id)
    .order("started_at", { ascending: false });

  if (error) {
    sessionsContainer.innerHTML = "<p>Could not load your sessions right now.</p>";
    return;
  }

  if (!sessions.length) {
    sessionsContainer.innerHTML = "<p>No interviews yet — start your first one below.</p>";
    statTotal.textContent = "0";
    statAvg.textContent = "0";
    statBest.textContent = "0";
    return;
  }

  // Compute overall stats across all scored metrics
  let allScores = [];
  sessions.forEach((s) => {
    (s.interview_scores || []).forEach((sc) => {
      allScores.push((Number(sc.score) / Number(sc.max_score)) * 100);
    });
  });

  const avgScore = allScores.length ? (allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
  const bestScore = allScores.length ? Math.max(...allScores) : 0;

  statTotal.textContent = sessions.length;
  statAvg.textContent = avgScore.toFixed(0) + "%";
  statBest.textContent = bestScore.toFixed(0) + "%";

  sessionsContainer.innerHTML = sessions.map((s) => {
    const sessionScores = s.interview_scores || [];
    const sessionAvg = sessionScores.length
      ? (sessionScores.reduce((sum, sc) => sum + (Number(sc.score) / Number(sc.max_score)) * 100, 0) / sessionScores.length)
      : null;

    const dateStr = new Date(s.started_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    return `
      <div class="session-item">
        <div>
          <strong>${s.round_type} Round</strong> — ${s.interview_mode.replace(/_/g, " ")}
          <div style="font-size:0.82rem; color:#57606F;">${dateStr} · ${s.status}</div>
        </div>
        <div style="display:flex; align-items:center; gap:1rem;">
          ${s.report_url ? `<a href="#" class="download-report-link" data-path="${s.report_url}" style="font-size:0.82rem; color:#9C7A2E; text-decoration:none; font-weight:600;">Download Report</a>` : ""}
          ${s.video_recording_url ? `<a href="#" class="download-video-link" data-path="${s.video_recording_url}" style="font-size:0.82rem; color:#9C7A2E; text-decoration:none; font-weight:600;">Download Video</a>` : ""}
          <a href="#" class="make-badge-link" data-session-id="${s.id}" style="font-size:0.82rem; color:#9C7A2E; text-decoration:none; font-weight:600;">Get Shareable Badge</a>
          <div class="session-score">${sessionAvg !== null ? sessionAvg.toFixed(0) + "%" : "Pending"}</div>
        </div>
      </div>
    `;
  }).join("");

  // Wire up download links: generate a fresh short-lived signed URL on click
  document.querySelectorAll(".download-report-link").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const path = link.getAttribute("data-path");
      const { data, error } = await supabaseClient.storage
        .from("interview-reports")
        .createSignedUrl(path, 60); // link valid for 60 seconds

      if (error || !data?.signedUrl) {
        alert("Could not generate download link. Please try again.");
        return;
      }
      window.open(data.signedUrl, "_blank");
    });
  });

  document.querySelectorAll(".download-video-link").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const path = link.getAttribute("data-path");
      const { data, error } = await supabaseClient.storage
        .from("interview-recordings")
        .createSignedUrl(path, 60);

      if (error || !data?.signedUrl) {
        alert("Could not generate download link. Please try again.");
        return;
      }
      window.open(data.signedUrl, "_blank");
    });
  });

  document.querySelectorAll(".make-badge-link").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const sessionId = link.getAttribute("data-session-id");
      const session = sessions.find((s) => s.id === sessionId);
      const companyName = session?.dream_selections?.company_name || "N/A";
      const roleName = session?.dream_selections?.role_name || "N/A";

      const { data, error } = await supabaseClient.from("public_badges").insert({
        user_id: currentUser.id,
        session_id: sessionId,
        company_name: companyName,
        role_name: roleName
      }).select().single();

      if (error || !data) {
        alert("Could not create badge. Please try again.");
        return;
      }

      const badgeUrl = `${window.location.origin}/badge.html?id=${data.id}`;
      prompt("Your shareable badge link (copy and paste anywhere, e.g. LinkedIn):", badgeUrl);
    });
  });
}

logoutLink.addEventListener("click", async (e) => {
  e.preventDefault();
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

(async () => {
  currentUser = await requireLogin();
  if (!currentUser) return;
  await loadProfile();
  await loadSessionsAndScores();
})();
