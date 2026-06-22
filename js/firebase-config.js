// ==========================================================================
// IshiTrackers — Firebase Configuration
// Project ID : ishitrackers
// Database   : asia-southeast1
// Version    : Production (compat SDK, no bundler required)
// ==========================================================================

// ✅ ROOT CAUSE OF PREVIOUS ERROR:
//    apiKey was set to placeholder "YOUR_API_KEY"
//    storageBucket was wrong ("appspot.com" instead of "firebasestorage.app")
//    messagingSenderId and appId were also placeholders.
//    All values are now correct.

const firebaseConfig = {
  apiKey:            "AIzaSyBsyw72Pt2jxcuzSzA_qh6uvbe7EWegZIg",
  authDomain:        "ishitrackers.firebaseapp.com",
  databaseURL:       "https://ishitrackers-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "ishitrackers",
  storageBucket:     "ishitrackers.firebasestorage.app",
  messagingSenderId: "388581548889",
  appId:             "1:388581548889:web:41d4eb28d6a2fa7e176248",
  measurementId:     "G-L9GTM62YTG"
};

// Guard: only initialise Firebase once even if this script is loaded multiple times
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db   = firebase.database();

// Analytics is optional — skip if blocked by ad-blockers
let analytics = null;
try {
  if (typeof firebase.analytics === "function") {
    analytics = firebase.analytics();
  }
} catch (_) {}

// ==========================================================================
// Route Guards
// ==========================================================================

/**
 * requireAuth(callback)
 * Redirects to login.html if the user is not signed in.
 * Provides (user, profile) to the callback once resolved.
 */
function requireAuth(callback) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    db.ref("users/" + user.uid).once("value")
      .then((snap) => {
        let profile = snap.val();
        if (!profile) {
          // First login after manual Firebase Console account creation
          profile = {
            name:      user.displayName || user.email.split("@")[0],
            email:     user.email,
            phone:     null,
            role:      "customer",
            devices:   [],
            disabled:  false,
            createdAt: firebase.database.ServerValue.TIMESTAMP
          };
          return db.ref("users/" + user.uid).set(profile).then(() => profile);
        }
        return profile;
      })
      .then((profile) => {
        if (profile.disabled) {
          showToast("Your account has been disabled. Contact support.", "danger");
          auth.signOut();
          setTimeout(() => { window.location.href = "login.html"; }, 1800);
          return;
        }
        callback(user, profile);
      })
      .catch((err) => {
        console.error("[requireAuth] DB error:", err);
      });
  });
}

/**
 * requireAdmin(callback)
 * Redirects non-admins to dashboard.html.
 */
function requireAdmin(callback) {
  requireAuth((user, profile) => {
    if (profile.role !== "admin") {
      showToast("Access denied. Admins only.", "danger");
      setTimeout(() => { window.location.href = "dashboard.html"; }, 1500);
      return;
    }
    callback(user, profile);
  });
}

/**
 * logout()
 * Signs out and redirects to login page.
 */
function logout() {
  auth.signOut()
    .then(() => { window.location.href = "login.html"; })
    .catch((err) => { console.error("[logout]", err); });
}

// ==========================================================================
// Utility Helpers
// ==========================================================================

function timeAgo(timestamp) {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60)  return seconds + "s ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return minutes + "m ago";
  const hours   = Math.floor(minutes / 60);
  if (hours   < 24)  return hours   + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

function isOnline(lastUpdate, thresholdMinutes = 5) {
  if (!lastUpdate) return false;
  return (Date.now() - lastUpdate) < thresholdMinutes * 60 * 1000;
}

function batteryColor(v) {
  if (v >= 3.9) return "#22c55e";
  if (v >= 3.6) return "#eab308";
  return "#ef4444";
}

function batteryPercent(v) {
  return Math.max(0, Math.min(100, Math.round(((v - 3.3) / (4.2 - 3.3)) * 100)));
}

function friendlyAuthError(code) {
  const MAP = {
    "auth/invalid-email":          "That email address is not valid.",
    "auth/email-already-in-use":   "An account already exists with that email.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/user-disabled":          "This account has been disabled.",
    "auth/user-not-found":         "No account found with that email.",
    "auth/wrong-password":         "Incorrect password.",
    "auth/invalid-credential":     "Incorrect email or password.",
    "auth/too-many-requests":      "Too many attempts. Please wait a moment.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/operation-not-allowed":  "Email/password login is not enabled in Firebase."
  };
  return MAP[code] || "Something went wrong (" + code + "). Try again.";
}

// ==========================================================================
// Toast Notification
// ==========================================================================

function showToast(message, type = "info") {
  const existing = document.getElementById("_ishi_toast");
  if (existing) existing.remove();

  const colors = {
    info:    { bg: "#161e2e", border: "#3b82f6", icon: "ℹ️" },
    success: { bg: "#162e1e", border: "#22c55e", icon: "✅" },
    danger:  { bg: "#2e1616", border: "#ef4444", icon: "❌" },
    warning: { bg: "#2e2816", border: "#eab308", icon: "⚠️" }
  };
  const c = colors[type] || colors.info;

  const t = document.createElement("div");
  t.id = "_ishi_toast";
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${c.bg};border:1px solid ${c.border};
    padding:14px 20px;border-radius:10px;
    box-shadow:0 4px 24px rgba(0,0,0,0.4);
    font-size:14px;display:flex;align-items:center;gap:10px;
    color:#e8edf6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    max-width:340px;word-break:break-word;
    animation:fadeInUp 0.25s ease;
  `;
  t.innerHTML = `<span>${c.icon}</span><span>${message}</span>`;
  document.body.appendChild(t);

  // Inject animation once
  if (!document.getElementById("_toast_style")) {
    const s = document.createElement("style");
    s.id = "_toast_style";
    s.textContent = "@keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}";
    document.head.appendChild(s);
  }
  setTimeout(() => { if (t.parentNode) t.remove(); }, 4000);
}
