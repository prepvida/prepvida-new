// =====================================================================
// PRICING PAGE LOGIC
// Fetches live plans from Supabase `subscription_plans` table and
// renders them. Each "Buy Now" button links to an Instamojo payment
// link — create one payment link per plan in your Instamojo dashboard
// and paste the URLs below.
// =====================================================================

const INSTAMOJO_LINKS = {
  "Basic": "PASTE_INSTAMOJO_PAYMENT_LINK_FOR_BASIC",
  "Pro": "PASTE_INSTAMOJO_PAYMENT_LINK_FOR_PRO",
  "Premium": "PASTE_INSTAMOJO_PAYMENT_LINK_FOR_PREMIUM"
};

async function loadPlans() {
  const container = document.getElementById("plans-container");
  const { data: plans, error } = await supabaseClient
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price", { ascending: true });

  if (error) {
    container.innerHTML = `<p>Could not load plans right now. Please refresh.</p>`;
    console.error(error);
    return;
  }

  container.innerHTML = plans.map((plan) => {
    const isFeatured = plan.name === "Pro";
    const features = Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features || "[]");
    const checkoutUrl = INSTAMOJO_LINKS[plan.name] || "#";

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

loadPlans();
