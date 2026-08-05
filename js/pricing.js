// =====================================================================
// PRICING PAGE LOGIC
// Fetches live plans from Supabase `subscription_plans` table, filtered
// by the selected academic year, and renders them.
// =====================================================================

const INSTAMOJO_LINKS = {
  "early-Basic": "PASTE_INSTAMOJO_LINK", "early-Pro": "PASTE_INSTAMOJO_LINK", "early-Premium": "PASTE_INSTAMOJO_LINK",
  "prefinal-Basic": "PASTE_INSTAMOJO_LINK", "prefinal-Pro": "PASTE_INSTAMOJO_LINK", "prefinal-Premium": "PASTE_INSTAMOJO_LINK",
  "final-Basic": "PASTE_INSTAMOJO_LINK", "final-Pro": "PASTE_INSTAMOJO_LINK", "final-Premium": "PASTE_INSTAMOJO_LINK"
};

let currentYear = "final";

async function loadPlans(year) {
  const container = document.getElementById("plans-container");
  container.innerHTML = "<p>Loading plans...</p>";

  const { data: plans, error } = await supabaseClient
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .eq("year_level", year)
    .order("price", { ascending: true });

  if (error || !plans || plans.length === 0) {
    container.innerHTML = `<p>Could not load plans right now. Please refresh.</p>`;
    console.error(error);
    return;
  }

  container.innerHTML = plans.map((plan) => {
    const isFeatured = plan.name === "Pro";
    const features = Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features || "[]");
    const checkoutUrl = INSTAMOJO_LINKS[`${year}-${plan.name}`] || "#";

    return `
      <div class="plan-card ${isFeatured ? "featured" : ""}">
        ${isFeatured ? '<span class="plan-tag">Most Popular</span>' : ""}
        <h3>${plan.name}</h3>
        <p>${plan.description || ""}</p>
        <div class="plan-price">₹${Number(plan.price)}<span> / ${plan.billing_cycle}</span></div>
        <ul class="plan-features">
          ${features.map((f) => `<li>${f}</li>`).join("")}
        </ul>
        <a class="btn ${isFeatured ? "btn-brass" : ""} btn-block" href="${checkoutUrl}">Choose ${plan.name}</a>
      </div>
    `;
  }).join("");
}

// ---------- Year tabs ----------
const yearDescriptions = {
  "early": "Build your foundation early. Practice communication and basic interview skills, whatever year you're in.",
  "prefinal": "Sharpen up with realistic company-style rounds as internship and placement season approaches.",
  "final": "Full placement-ready practice — company-specific rounds, resume-aware questions, and real interview pressure simulation."
};

const yearButtons = document.querySelectorAll(".year-tab-btn");
const yearDescriptionBox = document.getElementById("year-description");

function setActiveYear(year) {
  currentYear = year;
  yearButtons.forEach((btn) => {
    btn.classList.toggle("btn-brass", btn.getAttribute("data-year") === year);
  });
  const labels = { early: "Early Years", prefinal: "Pre-Final Year", final: "Final Year" };
  yearDescriptionBox.innerHTML = `<strong>${labels[year]}:</strong> ${yearDescriptions[year]}`;
  loadPlans(year);
}

yearButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveYear(btn.getAttribute("data-year")));
});

setActiveYear("final");
