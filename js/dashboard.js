// ==========================================================================
// dashboard.js — customer dashboard with real-time tracker cards
// ==========================================================================

(function () {
  "use strict";

  // Sidebar toggle
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  // Live clock
  function updateClock() {
    document.getElementById("liveClock").textContent =
      new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" });
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ---- Auth guard ----
  requireAuth((user, profile) => {
    document.getElementById("sidebarUser").textContent = profile.name || profile.email;
    if (profile.role === "admin") document.getElementById("adminLink").style.display = "flex";

    const isAdmin = profile.role === "admin";
    subscribeTrackers(user.uid, profile.devices || [], isAdmin);
    subscribeAlerts(user.uid, isAdmin);
  });

  const trackerData = {};   // deviceId -> { device, location }

  function subscribeTrackers(uid, deviceIds, isAdmin) {
    if (isAdmin) {
      // Admins watch all devices
      db.ref("devices").on("value", (snap) => {
        const all = snap.val() || {};
        const ids = Object.keys(all);
        ids.forEach((id) => { trackerData[id] = { device: all[id] }; });
        ids.forEach((id) => subscribeLocation(id));
        renderGrid(ids);
      });
    } else {
      if (deviceIds.length === 0) {
        renderGrid([]);
        setStats(0, 0, 0);
        return;
      }
      deviceIds.forEach((id) => {
        db.ref("devices/" + id).on("value", (snap) => {
          if (!trackerData[id]) trackerData[id] = {};
          trackerData[id].device = snap.val();
          renderGrid(deviceIds);
        });
        subscribeLocation(id);
      });
      renderGrid(deviceIds);
    }
  }

  function subscribeLocation(deviceId) {
    db.ref("locations/" + deviceId).on("value", (snap) => {
      if (!trackerData[deviceId]) trackerData[deviceId] = {};
      trackerData[deviceId].location = snap.val();
      renderCard(deviceId);
    });
  }

  function renderGrid(ids) {
    const grid = document.getElementById("trackerGrid");
    if (ids.length === 0) {
      grid.innerHTML = `
        <div class="card" style="grid-column:1/-1;">
          <div class="empty-state">
            <div class="e-icon">📡</div>
            <p>No trackers assigned to your account yet.<br>
               Contact your admin to get a device assigned.</p>
          </div>
        </div>`;
      setStats(0, 0, 0);
      return;
    }
    // Ensure card placeholders exist for each id
    ids.forEach((id) => {
      if (!document.getElementById("card-" + id)) {
        const div = document.createElement("div");
        div.id = "card-" + id;
        grid.appendChild(div);
        // Remove loading placeholder if still present
        const loader = grid.querySelector("[style*='grid-column:1/-1']");
        if (loader) loader.remove();
      }
      renderCard(id);
    });
    updateStats(ids);
  }

  function renderCard(id) {
    const el = document.getElementById("card-" + id);
    if (!el) return;
    const d   = (trackerData[id] || {}).device   || {};
    const loc = (trackerData[id] || {}).location || {};
    const online   = isOnline(d.lastUpdate);
    const battery  = loc.battery ?? d.battery ?? null;
    const speed    = loc.speed   ?? 0;
    const bPct     = battery != null ? batteryPercent(battery) : null;
    const bColor   = battery != null ? batteryColor(battery)   : "var(--text-muted)";
    const hasCoord = loc.lat != null && loc.lon != null;

    el.innerHTML = `
      <div class="card" style="cursor:pointer;" onclick="window.location.href='map.html?device=${encodeURIComponent(id)}'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
          <div>
            <div style="font-weight:700;font-size:16px;margin-bottom:4px;">${id}</div>
            <span class="badge ${online ? 'badge-online' : 'badge-offline'}">
              <span class="badge-dot"></span>${online ? "Online" : "Offline"}
            </span>
          </div>
          <div style="font-size:26px;">${online ? "🚗" : "🔴"}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;font-size:13px;">
          <div>
            <div style="color:var(--text-muted);margin-bottom:2px;">Speed</div>
            <div style="font-weight:600;">${speed} km/h</div>
          </div>
          <div>
            <div style="color:var(--text-muted);margin-bottom:2px;">Last Update</div>
            <div style="font-weight:600;">${timeAgo(d.lastUpdate)}</div>
          </div>
        </div>

        ${bPct != null ? `
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:4px;">
            <span>Battery</span><span style="color:${bColor}">${bPct}% (${battery.toFixed(2)}V)</span>
          </div>
          <div style="height:5px;border-radius:4px;background:var(--border-color);">
            <div style="height:100%;border-radius:4px;width:${bPct}%;background:${bColor};transition:width 0.4s;"></div>
          </div>
        </div>` : ""}

        ${hasCoord ? `
        <div style="font-size:12px;color:var(--text-secondary);">
          📍 ${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}
        </div>` : `
        <div style="font-size:12px;color:var(--text-muted);">📍 No GPS fix yet</div>`}

        <div style="margin-top:12px;">
          <a href="map.html?device=${encodeURIComponent(id)}" class="btn btn-primary btn-sm"
             onclick="event.stopPropagation();">View on Map</a>
          <a href="history.html?device=${encodeURIComponent(id)}" class="btn btn-outline btn-sm"
             onclick="event.stopPropagation();">History</a>
        </div>
      </div>`;
  }

  function updateStats(ids) {
    let online = 0;
    ids.forEach((id) => {
      const d = (trackerData[id] || {}).device || {};
      if (isOnline(d.lastUpdate)) online++;
    });
    setStats(ids.length, online, ids.length - online);
  }

  function setStats(total, online, offline) {
    document.getElementById("stTotal").textContent   = total;
    document.getElementById("stOnline").textContent  = online;
    document.getElementById("stOffline").textContent = offline;
  }

  function subscribeAlerts(uid, isAdmin) {
    const ref = isAdmin ? db.ref("alerts") : db.ref("alerts").orderByChild("uid").equalTo(uid);
    ref.on("value", (snap) => {
      let open = 0;
      snap.forEach((c) => { if (!c.val().resolved) open++; });
      document.getElementById("stAlerts").textContent = open;
    });
  }

})();
