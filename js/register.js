// ==========================================================================
// register.js — IshiTrackers registration logic
// ==========================================================================

(function () {
  "use strict";

  // Redirect already-logged-in users immediately
  auth.onAuthStateChanged((user) => {
    if (user) window.location.href = "dashboard.html";
  });

  const form          = document.getElementById("registerForm");
  const registerBtn   = document.getElementById("registerBtn");
  const errorMsg      = document.getElementById("errorMsg");
  const successMsg    = document.getElementById("successMsg");
  const pwInput       = document.getElementById("password");

  // ---------- Password strength indicator ----------
  pwInput.addEventListener("input", () => {
    const v   = pwInput.value;
    const bar = document.getElementById("pwStrengthBar");
    const lbl = document.getElementById("pwStrengthLabel");
    let score = 0;
    if (v.length >= 6)                              score++;
    if (v.length >= 10)                             score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v))        score++;
    if (/[0-9]/.test(v))                            score++;
    if (/[^A-Za-z0-9]/.test(v))                    score++;
    const configs = [
      { width: "0%",   bg: "transparent", label: "" },
      { width: "25%",  bg: "#ef4444",     label: "Weak" },
      { width: "50%",  bg: "#eab308",     label: "Fair" },
      { width: "75%",  bg: "#3b82f6",     label: "Good" },
      { width: "100%", bg: "#22c55e",     label: "Strong" }
    ];
    const cfg = configs[Math.min(score, 4)];
    bar.style.width      = cfg.width;
    bar.style.background = cfg.bg;
    lbl.textContent      = cfg.label;
    lbl.style.color      = cfg.bg;
  });

  // ---------- Form submission ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessages();

    const name            = document.getElementById("name").value.trim();
    const email           = document.getElementById("email").value.trim().toLowerCase();
    const phone           = document.getElementById("phone").value.trim();
    const password        = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // Client-side validation
    if (name.length < 2) {
      return showError("Full name must be at least 2 characters.");
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return showError("Please enter a valid email address.");
    }
    if (password.length < 6) {
      return showError("Password must be at least 6 characters.");
    }
    if (password !== confirmPassword) {
      return showError("Passwords do not match.");
    }

    setLoading(true);

    try {
      // 1️⃣  Create Firebase Auth account
      console.info("[register] Creating auth account for:", email);
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      const user        = credential.user;
      const uid         = user.uid;
      console.info("[register] Auth account created. UID:", uid);

      // 2️⃣  Update display name on Auth profile
      await user.updateProfile({ displayName: name });
      console.info("[register] Display name set:", name);

      // 3️⃣  Write user profile to Realtime Database
      const profileRecord = {
        name:      name,
        email:     email,
        phone:     phone || null,
        role:      "customer",          // default role
        devices:   [],                  // no devices yet
        disabled:  false,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      await db.ref("users/" + uid).set(profileRecord);
      console.info("[register] Profile saved to DB:", profileRecord);

      // 4️⃣  Success
      showSuccess("Account created! Redirecting to your dashboard…");
      setTimeout(() => { window.location.href = "dashboard.html"; }, 1600);

    } catch (error) {
      // Detailed logging for debugging
      console.error("[register] Error code   :", error.code);
      console.error("[register] Error message:", error.message);
      console.error("[register] Full error   :", error);
      showError(friendlyAuthError(error.code));
    } finally {
      setLoading(false);
    }
  });

  // ---------- Helpers ----------
  function showError(msg) {
    errorMsg.textContent   = msg;
    errorMsg.style.display = "block";
    successMsg.style.display = "none";
  }

  function showSuccess(msg) {
    successMsg.textContent   = msg;
    successMsg.style.display = "block";
    errorMsg.style.display   = "none";
  }

  function clearMessages() {
    errorMsg.style.display   = "none";
    successMsg.style.display = "none";
  }

  function setLoading(loading) {
    registerBtn.disabled     = loading;
    registerBtn.innerHTML    = loading
      ? '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px;"></span>Creating account…'
      : "Create Account";
  }

})();

function togglePw(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  const show  = input.type === "password";
  input.type      = show ? "text" : "password";
  icon.textContent = show ? "🙈" : "👁";
}
