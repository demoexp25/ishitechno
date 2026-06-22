/**
 * IshiTrackers - Cloud Functions
 * Device ingestion API for ESP32 / STM32+A7672S GPS trackers.
 *
 * Deploy with: firebase deploy --only functions
 * Endpoint (after deploy): https://<region>-ishitrackers.cloudfunctions.net/ingestLocation
 *
 * Install deps inside /functions:
 *   npm install firebase-admin firebase-functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.database();

const OVERSPEED_LIMIT_KMH = 80;
const LOW_BATTERY_VOLTAGE = 3.5;
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * POST /ingestLocation
 * Body (JSON):
 * {
 *   "deviceId": "GPS001",
 *   "secretKey": "ABC123",
 *   "lat": 16.5062,
 *   "lon": 80.6480,
 *   "speed": 45,
 *   "heading": 120,
 *   "battery": 4.1,
 *   "timestamp": 1700000500000   // optional - server time used if omitted
 * }
 *
 * Response:
 *   200 { "status": "ok" }
 *   400 { "error": "..." }   - malformed payload
 *   401 { "error": "..." }   - invalid deviceId / secretKey
 *   403 { "error": "..." }   - device disabled
 */
exports.ingestLocation = functions.https.onRequest(async (req, res) => {
  // CORS not required for device hardware, but harmless to allow
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const body = req.body || {};
    const { deviceId, secretKey, lat, lon } = body;
    let { speed, heading, battery, timestamp } = body;

    // ---- 1. Basic payload validation ----
    if (!deviceId || typeof deviceId !== "string") {
      return res.status(400).json({ error: "Missing or invalid deviceId." });
    }
    if (!secretKey || typeof secretKey !== "string") {
      return res.status(400).json({ error: "Missing or invalid secretKey." });
    }
    if (typeof lat !== "number" || typeof lon !== "number" ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: "Missing or invalid lat/lon." });
    }

    speed = typeof speed === "number" ? speed : 0;
    heading = typeof heading === "number" ? heading : null;
    battery = typeof battery === "number" ? battery : null;
    timestamp = typeof timestamp === "number" ? timestamp : Date.now();

    // ---- 2. Device validation (deviceId exists + secretKey matches) ----
    const deviceSnap = await db.ref("devices/" + deviceId).once("value");
    const device = deviceSnap.val();

    if (!device) {
      return res.status(401).json({ error: "Unknown deviceId." });
    }
    if (device.secretKey !== secretKey) {
      return res.status(401).json({ error: "Invalid secretKey." });
    }
    if (device.disabled) {
      return res.status(403).json({ error: "Device is disabled." });
    }

    // ---- 3. Write latest location (overwrite) ----
    const locationRecord = { lat, lon, speed, heading, battery, timestamp };
    await db.ref("locations/" + deviceId).set(locationRecord);

    // ---- 4. Append to history log (for route playback) ----
    await db.ref("history/" + deviceId).push(locationRecord);

    // ---- 5. Update device status/meta ----
    await db.ref("devices/" + deviceId).update({
      status: "online",
      battery,
      lastUpdate: timestamp
    });

    // ---- 6. Alert checks ----
    const alertPromises = [];

    if (speed > OVERSPEED_LIMIT_KMH) {
      alertPromises.push(createAlert(deviceId, device.ownerUid, "overspeed",
        `Speed ${speed} km/h exceeded limit of ${OVERSPEED_LIMIT_KMH} km/h`, speed));
    }

    if (battery != null && battery < LOW_BATTERY_VOLTAGE) {
      alertPromises.push(createAlert(deviceId, device.ownerUid, "low_battery",
        `Battery low: ${battery.toFixed(2)}V`, battery));
    }

    alertPromises.push(checkGeofences(deviceId, device.ownerUid, lat, lon));

    await Promise.all(alertPromises);

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("ingestLocation error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

async function createAlert(deviceId, uid, type, message, value) {
  return db.ref("alerts").push({
    deviceId, uid: uid || null, type, message, value,
    resolved: false,
    timestamp: Date.now()
  });
}

async function checkGeofences(deviceId, uid, lat, lon) {
  const snap = await db.ref("geofences").orderByChild("deviceId").equalTo(deviceId).once("value");
  const fences = snap.val();
  if (!fences) return;

  const tasks = [];
  Object.entries(fences).forEach(([fenceId, fence]) => {
    const distance = haversineMeters(lat, lon, fence.centerLat, fence.centerLon);
    const inside = distance <= fence.radiusMeters;

    // Compare against last-known inside/outside state stored on the fence record
    const wasInside = !!fence._lastInside;

    if (fence.alertOnExit && wasInside && !inside) {
      tasks.push(createAlert(deviceId, uid, "geofence_exit",
        `Device exited geofence "${fence.name}"`, distance));
    }
    if (fence.alertOnEnter && !wasInside && inside) {
      tasks.push(createAlert(deviceId, uid, "geofence_enter",
        `Device entered geofence "${fence.name}"`, distance));
    }
    if (wasInside !== inside) {
      tasks.push(db.ref("geofences/" + fenceId + "/_lastInside").set(inside));
    }
  });
  return Promise.all(tasks);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Scheduled function: marks devices offline if no update for OFFLINE_THRESHOLD_MS,
 * and raises an "offline" alert once per transition.
 * Deploy requires Firebase Blaze plan (for Cloud Scheduler).
 */
exports.checkOfflineDevices = functions.pubsub.schedule("every 5 minutes").onRun(async () => {
  const snap = await db.ref("devices").once("value");
  const devices = snap.val() || {};
  const now = Date.now();
  const tasks = [];

  Object.entries(devices).forEach(([deviceId, device]) => {
    const isStale = !device.lastUpdate || (now - device.lastUpdate) > OFFLINE_THRESHOLD_MS;
    if (isStale && device.status !== "offline") {
      tasks.push(db.ref("devices/" + deviceId + "/status").set("offline"));
      tasks.push(createAlert(deviceId, device.ownerUid, "offline",
        "Device has not reported in over 5 minutes", null));
    }
  });

  return Promise.all(tasks);
});
