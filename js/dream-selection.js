// =====================================================================
// DREAM COMPANY / ROLE SELECTION LOGIC
// =====================================================================

const companySelect = document.getElementById("company-select");
const roleSelect = document.getElementById("role-select");
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

async function loadCompanies() {
  const { data: companies, error } = await supabaseClient
    .from("companies")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (error) {
    companySelect.innerHTML = `<option value="">Could not load companies</option>`;
    return;
  }

  companySelect.innerHTML =
    `<option value="">Select a company</option>` +
    companies.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}

async function loadRolesForCompany(companyId) {
  if (!companyId) {
    roleSelect.innerHTML = `<option value="">Select a company first</option>`;
    return;
  }
  const { data: roles, error } = await supabaseClient
    .from("roles")
    .select("id, role_name")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("role_name");

  if (error || !roles.length) {
    roleSelect.innerHTML = `<option value="">No roles found for this company yet</option>`;
    return;
  }

  roleSelect.innerHTML =
    `<option value="">Select a role</option>` +
    roles.map((r) => `<option value="${r.id}">${r.role_name}</option>`).join("");
}

companySelect.addEventListener("change", () => {
  loadRolesForCompany(companySelect.value);
});

dreamForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const companyId = companySelect.value;
  const roleId = roleSelect.value;
  const experienceLevel = document.getElementById("experience-select").value;

  if (!companyId || !roleId) {
    showStatus("Please select both a company and a role.", "error");
    return;
  }

  // Deactivate previous selections, then insert the new active one
  await supabaseClient
    .from("dream_selections")
    .update({ is_active: false })
    .eq("user_id", currentUser.id);

  const { error } = await supabaseClient.from("dream_selections").insert({
    user_id: currentUser.id,
    company_id: companyId,
    role_id: roleId,
    experience_level: experienceLevel,
    is_active: true
  });

  if (error) {
    showStatus("Could not save your selection. Please try again.", "error");
    return;
  }

  window.location.href = "interview.html";
});

(async () => {
  currentUser = await requireLogin();
  if (currentUser) await loadCompanies();
})();
