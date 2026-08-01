// =====================================================================
// DREAM COMPANY / ROLE — free text, any company, any role
// =====================================================================

const companyInput = document.getElementById("company-input");
const companySuggestions = document.getElementById("company-suggestions");
const roleInput = document.getElementById("role-input");
const dreamForm = document.getElementById("dream-form");
const statusMessage = document.getElementById("status-message");

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = "status-msg " + type;
}

let currentUser = null;

async function requireLogin() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session.user;
}

// Loads past company names typed by anyone (just for handy autocomplete
// suggestions) — students are never limited to only these.
async function loadSuggestions() {
  const { data, error } = await supabaseClient
    .from("dream_selections")
    .select("company_name")
    .not("company_name", "is", null)
    .limit(200);

  if (error || !data) return;

  const uniqueNames = [...new Set(data.map((d) => d.company_name).filter(Boolean))];
  companySuggestions.innerHTML = uniqueNames.map((name) => `<option value="${name}"></option>`).join("");
}

dreamForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const companyName = companyInput.value.trim();
  const roleName = roleInput.value.trim();
  const experienceLevel = document.getElementById("experience-select").value;

  if (!companyName || !roleName) {
    showStatus("Please enter both a company and a role.", "error");
    return;
  }

  // Deactivate any previous selection, then save this one as active
  await supabaseClient
    .from("dream_selections")
    .update({ is_active: false })
    .eq("user_id", currentUser.id);

  const { error } = await supabaseClient.from("dream_selections").insert({
    user_id: currentUser.id,
    company_name: companyName,
    role_name: roleName,
    experience_level: experienceLevel,
    is_active: true
  });

  if (error) {
    showStatus("Could not save your selection. Please try again.", "error");
    console.error(error);
    return;
  }

  window.location.href = "interview.html";
});

(async () => {
  currentUser = await requireLogin();
  if (currentUser) await loadSuggestions();
})();
