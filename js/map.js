// ==========================================================================
// map.js — Live map with Leaflet, real-time Firebase listeners, clustering
// ==========================================================================

(function () {
  "use strict";

  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  let mapObj, cluster;
  const markers = {};     // deviceId -> L.Marker
  const liveData = {};    // deviceId -> { device, location }
  let trackedIds = [];
  let focusDevice = null; // device to auto-pan from URL param

  // Read ?device=GPS001 from URL
  const urlParams = new URLSearchParams(window.location.search);
  focusDevice = urlParams.get("device");

  function initMap() {
    mapObj = L.map("map", { zoomControl: true }).setView([16.5062, 80.648], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors", maxZoom: 19
    }).addTo(mapObj);
    cluster = L.markerClusterGroup({ disableClusteringAtZoom: 16 });
    mapObj.addLayer(cluster);
  }

  function makeIcon(online) {
    return L.divIcon({
      className: "",
      html: `<div style="width:36px;height:36px;border-radius:50%;
               background:${online ? "#3b82f6" : "#5b6779"};
               display:flex;align-items:center;justify-content:center;
               border:3px solid #0b0f17;box-shadow:0 2px 10px rgba(0,0,0,.5);
               font-size:16px;">${online ? "🚗" : "📍"}</div>`,
      iconSize:   [36, 36],
      iconAnchor: [18, 18],
      popupAnchor:[0, -20]
    });
  }

  function popupContent(id) {
    const d   = (liveData[id] || {}).device   || {};
    const loc = (liveData[id] || {}).location || {};
    const online  = isOnline(d.lastUpdate);
    const battery = loc.battery ?? d.battery ?? null;
    return `
      <div style="min-width:180px;">
        <b style="font-size:15px;">${id}</b>
        <div style="margin:6px 0;display:flex;align-items:center;gap:6px;">
          <span class="badge ${online ? "badge-online" : "badge-offline"}" style="font-size:11px;">
            <span class="badge-dot"></span>${online ? "Online" : "Offline"}
          </span>
        </div>
        <table style="font-size:12px;color:#94a3b8;width:100%;border-collapse:collapse;">
          <tr><td>Speed</td><td style="color:#e8edf6;text-align:right;">${loc.speed ?? 0} km/h</td></tr>
          <tr><td>Heading</td><td style="color:#e8edf6;text-align:right;">${loc.heading ?? "—"}°</td></tr>
          <tr><td>Battery</td><td style="color:#e8edf6;text-align:right;">
            ${battery != null ? batteryPercent(battery) + "% (" + battery.toFixed(2) + "V)" : "—"}</td></tr>
          <tr><td>Updated</td><td style="color:#e8edf6;text-align:right;">${timeAgo(d.lastUpdate)}</td></tr>
        </table>
        <div style="margin-top:8px;">
          <a href="history.html?device=${encodeURIComponent(id)}"
             style="font-size:12px;color:#3b82f6;">View History →</a>
        </div>
      </div>`;
  }

  function upsertMarker(id) {
    const loc    = (liveData[id] || {}).location || {};
    const device = (liveData[id] || {}).device   || {};
    if (loc.lat == null || loc.lon == null) return;

    const online = isOnline(device.lastUpdate);
    const latlng = [loc.lat, loc.lon];

    if (markers[id]) {
      markers[id].setLatLng(latlng);
      markers[id].setIcon(makeIcon(online));
      markers[id].setPopupContent(popupContent(id));
    } else {
      const m = L.marker(latlng, { icon: makeIcon(online) });
      m.bindPopup(popupContent(id), { maxWidth: 240 });
      m.on("click", () => setActivePanelRow(id));
      cluster.addLayer(m);
      markers[id] = m;
    }
  }

  function renderPanel() {
    const panel = document.getElementById("deviceListPanel");
    let onlineCount = 0;

    panel.innerHTML = trackedIds.map((id) => {
      const d = (liveData[id] || {}).device || {};
      const l = (liveData[id] || {}).location || {};
      const online = isOnline(d.lastUpdate);
      if (online) onlineCount++;
      return `
        <div class="dev-row" id="row-${id}" onclick="focusOnDevice('${id}')">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;font-size:14px;">${id}</span>
            <span class="badge ${online ? "badge-online" : "badge-offline"}" style="font-size:11px;">
              <span class="badge-dot"></span>${online ? "Online" : "Offline"}
            </span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">
            ${l.speed != null ? l.speed + " km/h · " : ""}${timeAgo(d.lastUpdate)}
          </div>
        </div>`;
    }).join("") || '<div style="padding:16px;font-size:13px;color:var(--text-muted);">No trackers found.</div>';

    document.getElementById("onlineCount").textContent = onlineCount + " online";

    // Update refresh badge
    document.getElementById("refreshBadge").innerHTML =
      `<span style="color:var(--success);">● Live</span> · ${new Date().toLocaleTimeString()}`;
  }

  function setActivePanelRow(id) {
    document.querySelectorAll(".dev-row").forEach(el => el.classList.remove("active"));
    const row = document.getElementById("row-" + id);
    if (row) { row.classList.add("active"); row.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  }

  // Exposed globally for onclick
  window.focusOnDevice = function (id) {
    const m = markers[id];
    if (m) {
      mapObj.setView(m.getLatLng(), 16);
      m.openPopup();
      setActivePanelRow(id);
    }
  };

  function subscribeDevice(id) {
    db.ref("devices/" + id).on("value", (snap) => {
      if (!liveData[id]) liveData[id] = {};
      liveData[id].device = snap.val() || {};
      upsertMarker(id);
      renderPanel();
    });
    db.ref("locations/" + id).on("value", (snap) => {
      if (!liveData[id]) liveData[id] = {};
      liveData[id].location = snap.val() || {};
      upsertMarker(id);
      renderPanel();
    });
  }

  initMap();

  requireAuth((user, profile) => {
    if (profile.role === "admin") document.getElementById("adminLink").style.display = "flex";

    if (profile.role === "admin") {
      db.ref("devices").on("value", (snap) => {
        trackedIds = Object.keys(snap.val() || {});
        trackedIds.forEach(subscribeDevice);
        renderPanel();
        if (focusDevice && markers[focusDevice]) {
          setTimeout(() => window.focusOnDevice(focusDevice), 1200);
        }
      });
    } else {
      trackedIds = profile.devices || [];
      trackedIds.forEach(subscribeDevice);
      renderPanel();
      if (focusDevice && trackedIds.includes(focusDevice)) {
        setTimeout(() => window.focusOnDevice(focusDevice), 1200);
      }
    }
  });

})();
