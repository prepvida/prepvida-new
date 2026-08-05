// =====================================================================
// DREAM COMPANY / ROLE — free text, any company, any role
// =====================================================================

const companyInput = document.getElementById("company-input");
const companySuggestions = document.getElementById("company-suggestions");
const roleInput = document.getElementById("role-input");
const dreamForm = document.getElementById("dream-form");
const statusMessage = document.getElementById("status-message");
const resumeInput = document.getElementById("resume-input");
const resumeStatus = document.getElementById("resume-status");

let extractedResumeText = "";
let verifiedCompanyNames = new Set();

// Live company lookup as the student types — confirms real companies
// exist without hard-blocking smaller/newer ones not in the database.
let companyLookupTimeout = null;
companyInput.addEventListener("input", () => {
  clearTimeout(companyLookupTimeout);
  const query = companyInput.value.trim();
  if (query.length < 2) {
    companySuggestions.innerHTML = "";
    return;
  }

  companyLookupTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const results = await res.json();

      verifiedCompanyNames = new Set(results.map((r) => r.name.toLowerCase()));
      companySuggestions.innerHTML = results.map((r) => `<option value="${r.name}"></option>`).join("");
    } catch (err) {
      console.warn("Company lookup unavailable:", err);
      // Fails silently — students can still type any company manually
    }
  }, 300); // debounce so we don't fire a request on every keystroke
});

// Extract text from the uploaded PDF resume as soon as it's selected
resumeInput.addEventListener("change", async () => {
  const file = resumeInput.files[0];
  if (!file) return;

  resumeStatus.textContent = "Reading your resume...";
  extractedResumeText = "";

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item) => item.str).join(" ") + "\n";
    }

    // Keep it reasonably short so it fits cleanly into the AI's prompt
    extractedResumeText = fullText.trim().slice(0, 3000);
    resumeStatus.textContent = `Resume loaded (${file.name}) — the AI will reference this during your interview.`;
  } catch (err) {
    console.error("Resume extraction failed:", err);
    resumeStatus.textContent = "Could not read this PDF. You can still continue without it.";
  }
});

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

  // Soft check — if the company wasn't found in our lookup, gently confirm
  // rather than blocking (smaller/newer real companies may not be listed)
  const isVerified = verifiedCompanyNames.has(companyName.toLowerCase());
  if (!isVerified && verifiedCompanyNames.size > 0) {
    const proceed = confirm(
      `We couldn't verify "${companyName}" as a known company. If it's a real company (even a small one), that's fine — click OK to continue anyway. Click Cancel to double-check the spelling.`
    );
    if (!proceed) return;
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
    year_level: document.getElementById("year-select").value,
    resume_text: extractedResumeText || null,
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
})();
