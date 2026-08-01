// =====================================================================
// CONTACT FORM LOGIC
// =====================================================================

const contactForm = document.getElementById("contact-form");
const statusMessage = document.getElementById("status-message");

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = "status-msg " + type;
}

contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const full_name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const message = document.getElementById("message").value.trim();

  const { error } = await supabaseClient.from("contact_enquiries").insert({
    full_name,
    email,
    message
  });

  if (error) {
    showStatus("Could not send your message. Please email hello@prepvida.in directly.", "error");
    return;
  }

  showStatus("Thanks — we've received your message and will get back to you soon.", "success");
  contactForm.reset();
});
