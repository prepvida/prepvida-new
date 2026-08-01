// =====================================================================
// AUTH LOGIC — Login & Signup
// =====================================================================

let isSignupMode = false;

const authForm = document.getElementById("auth-form");
const toggleModeLink = document.getElementById("toggle-mode");
const toggleText = document.getElementById("toggle-text");
const formHeading = document.getElementById("form-heading");
const submitBtn = document.getElementById("submit-btn");
const signupOnlyField = document.getElementById("signup-only");
const statusMessage = document.getElementById("status-message");

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = "status-msg " + type;
}

toggleModeLink.addEventListener("click", (e) => {
  e.preventDefault();
  isSignupMode = !isSignupMode;

  if (isSignupMode) {
    formHeading.textContent = "Create your account";
    submitBtn.textContent = "Create Account";
    toggleText.textContent = "Already have an account?";
    toggleModeLink.textContent = "Sign in";
    signupOnlyField.style.display = "block";
  } else {
    formHeading.textContent = "Welcome back";
    submitBtn.textContent = "Sign In";
    toggleText.textContent = "Don't have an account?";
    toggleModeLink.textContent = "Create one";
    signupOnlyField.style.display = "none";
  }
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const fullName = document.getElementById("full_name").value.trim();

  submitBtn.disabled = true;
  submitBtn.textContent = "Please wait...";

  try {
    if (isSignupMode) {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      showStatus("Account created! Check your email to confirm, then sign in.", "success");
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    showStatus(err.message || "Something went wrong. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isSignupMode ? "Create Account" : "Sign In";
  }
});

// Redirect to dashboard if already logged in
(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = "dashboard.html";
  }
})();
