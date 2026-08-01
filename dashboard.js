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
    .select("id, round_type, interview_mode, status, started_at, completed_at, interview_scores(score, max_score, metric_name)")
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
        <div class="session-score">${sessionAvg !== null ? sessionAvg.toFixed(0) + "%" : "Pending"}</div>
      </div>
    `;
  }).join("");
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
