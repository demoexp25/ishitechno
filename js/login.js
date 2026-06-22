// ==========================================================================
// login.js — IshiTrackers login logic
// ==========================================================================

(function () {
  "use strict";

  const form      = document.getElementById("loginForm");
  const loginBtn  = document.getElementById("loginBtn");
  const errorMsg  = document.getElementById("errorMsg");
  const successMsg = document.getElementById("successMsg");

  // Redirect if already logged in
  auth.onAuthStateChanged((user) => {
    if (!user) return;
    redirectByRole(user.uid);
  });

  // ---------- Login submit ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessages();

    const email    = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const remember = document.getElementById("rememberMe").checked;

    if (!email || !password) {
      return showError("Please enter your email and password.");
    }

    setLoading(true);

    // Set Firebase Auth persistence
    const persistence = remember
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;

    try {
      await auth.setPersistence(persistence);
      console.info("[login] Signing in:", email);
      const credential = await auth.signInWithEmailAndPassword(email, password);
      console.info("[login] Success. UID:", credential.user.uid);
      showSuccess("Login successful! Redirecting…");
      // onAuthStateChanged will handle redirect
    } catch (error) {
      console.error("[login] Error code   :", error.code);
      console.error("[login] Error message:", error.message);
      showError(friendlyAuthError(error.code));
      setLoading(false);
    }
  });

  // ---------- Forgot password ----------
  document.getElementById("forgotLink").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    if (!email) {
      return showError("Enter your email address first, then click Forgot password.");
    }
    try {
      await auth.sendPasswordResetEmail(email);
      showSuccess("Reset email sent to " + email + ". Check your inbox.");
    } catch (error) {
      console.error("[forgot-password]", error.code, error.message);
      showError(friendlyAuthError(error.code));
    }
  });

  // ---------- Role-based redirect ----------
  function redirectByRole(uid) {
    db.ref("users/" + uid + "/role").once("value")
      .then((snap) => {
        const role = snap.val();
        console.info("[login] Role:", role);
        window.location.href = (role === "admin") ? "admin.html" : "dashboard.html";
      })
      .catch((err) => {
        console.error("[login] Could not read role:", err);
        window.location.href = "dashboard.html";
      });
  }

  // ---------- Helpers ----------
  function showError(msg)   { errorMsg.textContent = msg;  errorMsg.style.display  = "block"; successMsg.style.display = "none"; }
  function showSuccess(msg) { successMsg.textContent = msg; successMsg.style.display = "block"; errorMsg.style.display  = "none"; }
  function clearMessages()  { errorMsg.style.display = "none"; successMsg.style.display = "none"; }

  function setLoading(on) {
    loginBtn.disabled   = on;
    loginBtn.innerHTML  = on
      ? '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px;"></span>Logging in…'
      : "Login";
  }

})();

function togglePw() {
  const input = document.getElementById("password");
  const eye   = document.getElementById("pwEye");
  const show  = input.type === "password";
  input.type      = show ? "text" : "password";
  eye.textContent = show ? "🙈" : "👁";
}
