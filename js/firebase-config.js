// ==========================================================================
// IshiTrackers - Firebase Configuration
// Project: ishitrackers
// ==========================================================================

// TODO: Replace with your actual Firebase Web App config
// (Firebase Console -> Project Settings -> General -> Your apps -> SDK config)

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBsyw72Pt2jxcuzSzA_qh6uvbe7EWegZIg",
  authDomain: "ishitrackers.firebaseapp.com",
  databaseURL: "https://ishitrackers-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ishitrackers",
  storageBucket: "ishitrackers.firebasestorage.app",
  messagingSenderId: "388581548889",
  appId: "1:388581548889:web:41d4eb28d6a2fa7e176248",
  measurementId: "G-L9GTM62YTG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
//const analytics = getAnalytics(app);

// Initialize Firebase (compat SDK - works directly on GitHub Pages, no bundler needed)


const auth = firebase.auth();
const db = firebase.database();

// ==========================================================================
// Global Auth State Helper
// ==========================================================================
// Pages call requireAuth() to protect routes, or requireAdmin() for admin-only pages.

function requireAuth(callback) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    db.ref("users/" + user.uid).once("value").then((snap) => {
      const profile = snap.val();
      if (!profile) {
        // No profile record yet - create a minimal one
        db.ref("users/" + user.uid).set({
          name: user.displayName || user.email.split("@")[0],
          email: user.email,
          role: "customer",
          devices: [],
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        callback(user, { role: "customer", devices: [] });
      } else {
        if (profile.disabled) {
          alert("Your account has been disabled. Contact support.");
          auth.signOut();
          window.location.href = "login.html";
          return;
        }
        callback(user, profile);
      }
    });
  });
}

function requireAdmin(callback) {
  requireAuth((user, profile) => {
    if (profile.role !== "admin") {
      alert("Access denied. Admins only.");
      window.location.href = "dashboard.html";
      return;
    }
    callback(user, profile);
  });
}

function logout() {
  auth.signOut().then(() => {
    window.location.href = "login.html";
  });
}

// ==========================================================================
// Shared utility functions
// ==========================================================================

function timeAgo(timestamp) {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return seconds + "s ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  return days + "d ago";
}

function isOnline(lastUpdate, thresholdMinutes = 5) {
  if (!lastUpdate) return false;
  return (Date.now() - lastUpdate) < thresholdMinutes * 60 * 1000;
}

function batteryColor(voltage) {
  // Typical Li-ion: 3.3v empty - 4.2v full
  if (voltage >= 3.9) return "#22c55e";
  if (voltage >= 3.6) return "#eab308";
  return "#ef4444";
}

function batteryPercent(voltage) {
  const pct = ((voltage - 3.3) / (4.2 - 3.3)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
