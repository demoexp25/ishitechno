# IshiTrackers — Deployment & Device API Guide

Ishi Techno Projects · ishitechnoprojects.in
Firebase Project: `ishitrackers` · Database: `https://ishitrackers-default-rtdb.asia-southeast1.firebasedatabase.app`

---

## 1. Project Folder Structure

```
ishitrackers/
├── index.html              # Landing page
├── login.html               # Login
├── register.html            # Registration
├── dashboard.html            # User dashboard (assigned trackers)
├── map.html                  # Live map (Leaflet + OSM)
├── history.html               # Route history + playback
├── profile.html                # User profile
├── admin.html                   # Admin panel
├── css/
│   └── style.css                 # Shared dark-mode enterprise UI
├── js/
│   └── firebase-config.js         # Firebase init + auth/route helpers
├── assets/                          # Logos, icons, images
├── functions/                        # Cloud Functions (device ingestion API)
│   ├── index.js
│   └── package.json
├── firebase-schema.json               # DB schema reference
└── database.rules.json                 # Realtime Database security rules
```

---

## 2. Firebase Project Setup

1. Go to the [Firebase Console](https://console.firebase.google.com) → select project **ishitrackers**.
2. **Authentication** → Sign-in method → Enable **Email/Password**.
3. **Realtime Database** → confirm it's created in region `asia-southeast1` at the URL above.
4. **Project Settings → General → Your apps** → Add a **Web App** → copy the config object.
5. Paste that config into `js/firebase-config.js` (replace the placeholder `firebaseConfig`).
6. **Realtime Database → Rules** → paste the contents of `database.rules.json` → Publish.

Create your first admin user:
1. Register normally via `register.html` (creates a `customer` role by default).
2. In Firebase Console → Realtime Database → `users/<uid>/role`, manually change the value to `"admin"`.
3. Log out and back in — the Admin Panel link will now appear in the sidebar.

---

## 3. Deploying the Frontend to GitHub Pages

```bash
# From inside the ishitrackers/ folder
git init
git add .
git commit -m "Initial commit - IshiTrackers platform"
git branch -M main
git remote add origin https://github.com/<your-username>/ishitrackers.git
git push -u origin main
```

Then in GitHub:
1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch** → Branch: `main` → folder `/ (root)`
3. Save. Your site will be live at `https://<your-username>.github.io/ishitrackers/`

To use your custom domain (`ishitechnoprojects.in` or a subdomain like `track.ishitechnoprojects.in`):
1. Repo → Settings → Pages → **Custom domain** → enter the domain.
2. Add a `CNAME` DNS record at your domain registrar pointing the subdomain to `<your-username>.github.io`.
3. Wait for DNS propagation, then enable **Enforce HTTPS** in GitHub Pages settings.

> Note: Firebase Authentication requires your domain to be in the **Authorized domains** list (Firebase Console → Authentication → Settings → Authorized domains). Add your GitHub Pages domain and custom domain there.

---

## 4. Deploying Cloud Functions (Device Ingestion API)

Cloud Functions require the **Blaze (pay-as-you-go)** plan (free tier covers low-traffic use).

```bash
npm install -g firebase-tools
firebase login
cd ishitrackers
firebase init functions     # select existing project "ishitrackers", choose JavaScript
# Copy functions/index.js and functions/package.json into the generated functions/ folder
cd functions
npm install
cd ..
firebase deploy --only functions
```

After deploy, note your endpoint URL, typically:
```
https://us-central1-ishitrackers.cloudfunctions.net/ingestLocation
```
(Region may differ — check the deploy output.)

Also deploy the scheduled offline-checker (requires Blaze plan + Cloud Scheduler API enabled):
```bash
firebase deploy --only functions:checkOfflineDevices
```

---

## 5. GPS Device API Documentation (ESP32 / STM32 + A7672S)

### Endpoint
```
POST https://<region>-ishitrackers.cloudfunctions.net/ingestLocation
Content-Type: application/json
```

### Request Body
```json
{
  "deviceId": "GPS001",
  "secretKey": "ABC123XYZ9",
  "lat": 16.5062,
  "lon": 80.6480,
  "speed": 45,
  "heading": 120,
  "battery": 4.1,
  "timestamp": 1700000500000
}
```

| Field      | Type   | Required | Notes                                      |
|------------|--------|----------|---------------------------------------------|
| deviceId   | string | Yes      | Must already exist in `/devices` (created via Admin Panel) |
| secretKey  | string | Yes      | Must match `devices/{deviceId}/secretKey`   |
| lat        | number | Yes      | -90 to 90                                   |
| lon        | number | Yes      | -180 to 180                                 |
| speed      | number | No       | km/h, defaults to 0                         |
| heading    | number | No       | degrees 0–359                               |
| battery    | number | No       | volts (e.g. 4.1)                            |
| timestamp  | number | No       | Unix ms; server time used if omitted        |

### Responses
| Code | Meaning                              |
|------|----------------------------------------|
| 200  | `{ "status": "ok" }` — accepted        |
| 400  | Malformed payload (missing/invalid fields) |
| 401  | Unknown `deviceId` or wrong `secretKey` |
| 403  | Device is disabled by admin            |
| 500  | Server error                            |

### ESP32 Example (Arduino, HTTP over WiFi)
```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPSPlus.h>

const char* ssid = "YOUR_WIFI";
const char* password = "YOUR_WIFI_PASSWORD";
const char* endpoint = "https://us-central1-ishitrackers.cloudfunctions.net/ingestLocation";
const char* deviceId = "GPS001";
const char* secretKey = "ABC123XYZ9";

TinyGPSPlus gps;

void sendLocation(float lat, float lon, float speed, float heading, float battery) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(endpoint);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"deviceId\":\"" + String(deviceId) + "\",";
  payload += "\"secretKey\":\"" + String(secretKey) + "\",";
  payload += "\"lat\":" + String(lat, 6) + ",";
  payload += "\"lon\":" + String(lon, 6) + ",";
  payload += "\"speed\":" + String(speed, 1) + ",";
  payload += "\"heading\":" + String(heading, 1) + ",";
  payload += "\"battery\":" + String(battery, 2);
  payload += "}";

  int code = http.POST(payload);
  Serial.printf("Ingest response: %d\n", code);
  http.end();
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
}

void loop() {
  // Feed gps object from Serial2 (GPS module UART) elsewhere in your code...
  if (gps.location.isUpdated()) {
    float batteryVoltage = analogRead(34) * (3.3 / 4095.0) * 2; // example voltage divider
    sendLocation(gps.location.lat(), gps.location.lng(),
                 gps.speed.kmph(), gps.course.deg(), batteryVoltage);
  }
  delay(10000); // send every 10 seconds
}
```

### STM32 + A7672S (cellular modem, AT commands) Notes
Since the A7672S uses AT commands over UART rather than a native HTTP stack, the general flow is:
1. `AT+CGATT=1` — attach to GPRS/LTE network.
2. `AT+HTTPINIT` — initialize HTTP service.
3. `AT+HTTPPARA="URL","https://us-central1-ishitrackers.cloudfunctions.net/ingestLocation"`
4. `AT+HTTPPARA="CONTENT","application/json"`
5. `AT+HTTPDATA=<length>,10000` then send the JSON payload (same schema as above).
6. `AT+HTTPACTION=1` — perform POST.
7. `AT+HTTPREAD` — read response, check for `"status":"ok"`.
8. `AT+HTTPTERM` — close HTTP service.

Build the JSON string in your STM32 firmware the same way as the ESP32 example, substituting GPS data parsed from the A7672S's own GNSS NMEA output (`AT+CGNSSINFO`).

### Device Validation & Error Handling (server-side, already implemented in `functions/index.js`)
- Rejects malformed payloads (missing fields, out-of-range lat/lon) → `400`
- Rejects unknown `deviceId` → `401`
- Rejects mismatched `secretKey` → `401`
- Rejects writes to a `disabled` device → `403`
- On valid write: updates `/locations/{deviceId}` (latest position), appends to `/history/{deviceId}` (for playback), updates `/devices/{deviceId}` status/battery/lastUpdate, and evaluates overspeed / low-battery / geofence alerts.

---

## 6. Alerts Logic Summary

| Alert type      | Trigger condition                                  |
|------------------|------------------------------------------------------|
| `overspeed`       | `speed > 80 km/h` (edit `OVERSPEED_LIMIT_KMH` in `functions/index.js`) |
| `low_battery`      | `battery < 3.5V` (edit `LOW_BATTERY_VOLTAGE`)         |
| `geofence_exit`     | Device was inside a fence (`alertOnExit: true`) and leaves it |
| `geofence_enter`     | Device was outside a fence (`alertOnEnter: true`) and enters it |
| `offline`              | No update for 5+ minutes (checked by the scheduled function every 5 min) |

All alerts are written to `/alerts/{pushId}` with `resolved: false`. Build a simple UI toggle in `admin.html` or `dashboard.html` to mark `resolved: true` once handled (not included by default — extend `db.ref('alerts/' + id).update({resolved: true})`).

---

## 7. Security Checklist Before Going Live

- [ ] Replace placeholder values in `js/firebase-config.js` with real Firebase config
- [ ] Publish `database.rules.json` to Realtime Database Rules
- [ ] Enable Email/Password sign-in in Firebase Authentication
- [ ] Add your GitHub Pages / custom domain to Firebase Authorized Domains
- [ ] Deploy Cloud Functions on Blaze plan; rotate `secretKey` values per device, never reuse
- [ ] Restrict Cloud Function CORS origin in production (currently `*` for device compatibility — consider IP allow-listing or a dedicated API key header check if devices support custom headers)
- [ ] Set up Firebase Database backups (Console → Realtime Database → Backups, or scheduled export via Admin SDK)
- [ ] Periodically prune `/history/{deviceId}` (e.g. a scheduled function deleting entries older than 90 days) to control storage costs
- [ ] Promote your first admin user manually in the Console (Section 2 above)

---

## 8. Local Development

No build step required — pure HTML/CSS/JS. Just serve the folder locally:

```bash
cd ishitrackers
python3 -m http.server 8080
# Visit http://localhost:8080
```

(Firebase Auth/Database calls work fine from `localhost` once it's added to Authorized Domains, which it is by default for Firebase projects.)
