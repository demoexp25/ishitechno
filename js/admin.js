// ==========================================================================
// admin.js — full admin panel: devices, users, alerts
// ==========================================================================

(function () {
  "use strict";

  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  let allDevices  = {};
  let allUsers    = {};
  let allLocations= {};
  let editingDev  = null;
  let editingUid  = null;
  let assigningDev= null;

  // ---- Auth guard (admin only) ----
  requireAdmin((user, profile) => {
    document.getElementById("adminBadge").textContent = profile.name + " · Admin";
    loadAll();
  });

  function loadAll() {
    // Devices
    db.ref("devices").on("value", (snap) => {
      allDevices = snap.val() || {};
      document.getElementById("stDevices").textContent = Object.keys(allDevices).length;
      let live = 0;
      Object.values(allDevices).forEach(d => { if (isOnline(d.lastUpdate)) live++; });
      document.getElementById("stLive").textContent = live;
      renderDevTable();
      populateOwnerSelect();
      populateAssignUserSel();
    });

    // Live locations (for speed column)
    db.ref("locations").on("value", (snap) => {
      allLocations = snap.val() || {};
      renderDevTable();
    });

    // Users
    db.ref("users").on("value", (snap) => {
      allUsers = snap.val() || {};
      document.getElementById("stUsers").textContent = Object.keys(allUsers).length;
      renderUserTable();
      populateOwnerSelect();
      populateAssignUserSel();
    });

    // Alerts
    db.ref("alerts").on("value", (snap) => {
      const all = snap.val() || {};
      let open = 0;
      Object.values(all).forEach(a => { if (!a.resolved) open++; });
      document.getElementById("stAlerts").textContent = open;
      renderAlertTable(all);
    });
  }

  // ======================== DEVICE TABLE ========================

  window.renderDevTable = function () {
    const filter = (document.getElementById("devSearch").value || "").toLowerCase();
    const tbody  = document.getElementById("devTbody");
    const ids    = Object.keys(allDevices).filter(id => id.toLowerCase().includes(filter));

    if (ids.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted">${filter ? "No matches." : "No devices yet."}</td></tr>`;
      return;
    }

    tbody.innerHTML = ids.map((id) => {
      const d      = allDevices[id];
      const loc    = allLocations[id] || {};
      const online = isOnline(d.lastUpdate);
      const owner  = d.ownerUid && allUsers[d.ownerUid]
                      ? allUsers[d.ownerUid].name + "<br><small>" + allUsers[d.ownerUid].email + "</small>"
                      : "<span class='text-muted'>Unassigned</span>";
      const bat    = loc.battery ?? d.battery;
      return `<tr>
        <td><b>${id}</b><br><small class="text-muted">${d.secretKey}</small></td>
        <td>${owner}</td>
        <td><span class="badge ${d.disabled ? "badge-warning" : (online ? "badge-online" : "badge-offline")}">
              <span class="badge-dot"></span>${d.disabled ? "Disabled" : (online ? "Online" : "Offline")}
            </span></td>
        <td>${bat != null ? batteryPercent(bat) + "%" : "—"}</td>
        <td>${loc.speed != null ? loc.speed + " km/h" : "—"}</td>
        <td>${timeAgo(d.lastUpdate)}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openDevModal('${id}')">Edit</button>
          <button class="btn btn-outline btn-sm" onclick="openAssignModal('${id}')">Assign</button>
          <button class="btn btn-outline btn-sm" onclick="toggleDevice('${id}',${!d.disabled})">${d.disabled ? "Enable" : "Disable"}</button>
          <button class="btn btn-danger  btn-sm" onclick="deleteDevice('${id}')">Delete</button>
        </td>
      </tr>`;
    }).join("");
  };

  // ======================== USER TABLE ========================

  window.renderUserTable = function () {
    const filter = (document.getElementById("userSearch").value || "").toLowerCase();
    const tbody  = document.getElementById("userTbody");
    const uids   = Object.keys(allUsers).filter(uid => {
      const u = allUsers[uid];
      return (u.name || "").toLowerCase().includes(filter) ||
             (u.email || "").toLowerCase().includes(filter);
    });

    if (uids.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted">${filter ? "No matches." : "No users yet."}</td></tr>`;
      return;
    }

    tbody.innerHTML = uids.map((uid) => {
      const u     = allUsers[uid];
      const devs  = (u.devices || []);
      return `<tr>
        <td>${u.name || "—"}</td>
        <td>${u.email || "—"}</td>
        <td>${u.phone || "—"}</td>
        <td><select onchange="changeRole('${uid}',this.value)"
                    style="width:auto;padding:4px 8px;font-size:13px;">
              <option value="customer" ${u.role==="customer"?"selected":""}>Customer</option>
              <option value="admin"    ${u.role==="admin"?"selected":""}>Admin</option>
            </select></td>
        <td>${devs.length > 0
               ? devs.map(d => `<span class="badge badge-online" style="margin:2px;">${d}</span>`).join("")
               : "<span class='text-muted'>None</span>"}</td>
        <td><span class="badge ${u.disabled ? "badge-offline" : "badge-online"}">
              <span class="badge-dot"></span>${u.disabled ? "Disabled" : "Active"}
            </span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openEditUser('${uid}')">Edit</button>
          <button class="btn btn-outline btn-sm" onclick="toggleUser('${uid}',${!u.disabled})">${u.disabled ? "Enable" : "Disable"}</button>
          <button class="btn btn-danger  btn-sm" onclick="deleteUserRecord('${uid}')">Delete</button>
        </td>
      </tr>`;
    }).join("");
  };

  // ======================== ALERT TABLE ========================

  function renderAlertTable(all) {
    const tbody = document.getElementById("alertTbody");
    const entries = Object.entries(all).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    if (entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No alerts.</td></tr>`;
      return;
    }
    const typeIcon = { overspeed:"⚡", low_battery:"🔋", offline:"📴",
                       geofence_exit:"🚧", geofence_enter:"🏁" };
    tbody.innerHTML = entries.map(([aid, a]) => `
      <tr>
        <td>${a.timestamp ? new Date(a.timestamp).toLocaleString() : "—"}</td>
        <td><b>${a.deviceId}</b></td>
        <td>${typeIcon[a.type] || "⚠️"} ${a.type}</td>
        <td>${a.message}</td>
        <td><span class="badge ${a.resolved ? "badge-online" : "badge-warning"}">
              ${a.resolved ? "Resolved" : "Open"}
            </span></td>
        <td>${!a.resolved
          ? `<button class="btn btn-outline btn-sm" onclick="resolveAlert('${aid}')">Resolve</button>`
          : ""}</td>
      </tr>`).join("");
  }

  window.resolveAlert = function (aid) {
    db.ref("alerts/" + aid + "/resolved").set(true);
  };

  window.resolveAllAlerts = function () {
    db.ref("alerts").orderByChild("resolved").equalTo(false).once("value", (snap) => {
      const updates = {};
      snap.forEach(c => { updates["alerts/" + c.key + "/resolved"] = true; });
      db.ref().update(updates);
    });
  };

  // ======================== DEVICE CRUD ========================

  window.openDevModal = function (id) {
    editingDev = id || null;
    const title = document.getElementById("devModalTitle");
    const idInp = document.getElementById("mDevId");
    const keyInp= document.getElementById("mDevKey");
    const own   = document.getElementById("mDevOwner");
    document.getElementById("devModalErr").style.display = "none";

    if (id) {
      title.textContent = "Edit Device: " + id;
      idInp.value       = id;
      idInp.disabled    = true;
      keyInp.value      = allDevices[id].secretKey || "";
      own.value         = allDevices[id].ownerUid  || "";
    } else {
      title.textContent = "Add Device";
      idInp.value       = "";
      idInp.disabled    = false;
      keyInp.value      = genKeyStr();
      own.value         = "";
    }
    document.getElementById("devModal").classList.add("open");
  };

  window.genKey = function () {
    document.getElementById("mDevKey").value = genKeyStr();
  };

  function genKeyStr() {
    return Math.random().toString(36).slice(2,12).toUpperCase();
  }

  window.saveDevice = function () {
    const id     = document.getElementById("mDevId").value.trim().toUpperCase();
    const key    = document.getElementById("mDevKey").value.trim();
    const owner  = document.getElementById("mDevOwner").value;
    const errEl  = document.getElementById("devModalErr");

    if (!id)  { errEl.textContent = "Device ID is required.";  errEl.style.display = "block"; return; }
    if (!key) { errEl.textContent = "Secret Key is required."; errEl.style.display = "block"; return; }
    if (!editingDev && allDevices[id]) {
      errEl.textContent = "Device ID already exists."; errEl.style.display = "block"; return;
    }

    const existing  = allDevices[id] || {};
    const prevOwner = existing.ownerUid || null;
    const updates   = {};

    updates["devices/" + id] = {
      secretKey:  key,
      ownerUid:   owner || null,
      status:     existing.status   || "offline",
      battery:    existing.battery  ?? null,
      lastUpdate: existing.lastUpdate || null,
      disabled:   existing.disabled || false,
      createdAt:  existing.createdAt || firebase.database.ServerValue.TIMESTAMP
    };

    // Update user device arrays
    if (prevOwner && prevOwner !== owner && allUsers[prevOwner]) {
      updates["users/" + prevOwner + "/devices"] =
        (allUsers[prevOwner].devices || []).filter(d => d !== id);
    }
    if (owner && allUsers[owner]) {
      const set = new Set(allUsers[owner].devices || []);
      set.add(id);
      updates["users/" + owner + "/devices"] = Array.from(set);
    }

    db.ref().update(updates)
      .then(() => { closeModal("devModal"); showToast("Device saved.", "success"); })
      .catch(err => { errEl.textContent = err.message; errEl.style.display = "block"; });
  };

  window.toggleDevice = function (id, disabled) {
    db.ref("devices/" + id + "/disabled").set(disabled)
      .then(() => showToast("Device " + (disabled ? "disabled" : "enabled") + ".", "info"));
  };

  window.deleteDevice = function (id) {
    if (!confirm("Delete device " + id + "? This also removes its location and history.")) return;
    const owner   = (allDevices[id] || {}).ownerUid;
    const updates = {};
    updates["devices/"  + id] = null;
    updates["locations/" + id] = null;
    updates["history/"  + id] = null;
    if (owner && allUsers[owner]) {
      updates["users/" + owner + "/devices"] =
        (allUsers[owner].devices || []).filter(d => d !== id);
    }
    db.ref().update(updates).then(() => showToast("Device deleted.", "danger"));
  };

  // ======================== ASSIGN MODAL ========================

  window.openAssignModal = function (id) {
    assigningDev = id;
    document.getElementById("assignSubtitle").textContent = "Device: " + id;
    const sel = document.getElementById("assignUserSel");
    sel.value = (allDevices[id] || {}).ownerUid || "";
    document.getElementById("assignModal").classList.add("open");
  };

  window.confirmAssign = function () {
    if (!assigningDev) return;
    const newUid    = document.getElementById("assignUserSel").value;
    const prevOwner = (allDevices[assigningDev] || {}).ownerUid || null;
    const updates   = {};

    updates["devices/" + assigningDev + "/ownerUid"] = newUid || null;

    if (prevOwner && allUsers[prevOwner]) {
      updates["users/" + prevOwner + "/devices"] =
        (allUsers[prevOwner].devices || []).filter(d => d !== assigningDev);
    }
    if (newUid && allUsers[newUid]) {
      const set = new Set(allUsers[newUid].devices || []);
      set.add(assigningDev);
      updates["users/" + newUid + "/devices"] = Array.from(set);
    }

    db.ref().update(updates).then(() => {
      closeModal("assignModal");
      showToast("Tracker assigned.", "success");
    });
  };

  // ======================== USER CRUD ========================

  window.openEditUser = function (uid) {
    editingUid = uid;
    const u = allUsers[uid] || {};
    document.getElementById("euName").value  = u.name  || "";
    document.getElementById("euPhone").value = u.phone || "";
    document.getElementById("euRole").value  = u.role  || "customer";
    document.getElementById("editUserModal").classList.add("open");
  };

  window.saveUser = function () {
    if (!editingUid) return;
    const updates = {
      name:  document.getElementById("euName").value.trim(),
      phone: document.getElementById("euPhone").value.trim(),
      role:  document.getElementById("euRole").value
    };
    db.ref("users/" + editingUid).update(updates)
      .then(() => { closeModal("editUserModal"); showToast("User updated.", "success"); });
  };

  window.changeRole = function (uid, role) {
    db.ref("users/" + uid + "/role").set(role)
      .then(() => showToast("Role updated to " + role + ".", "info"));
  };

  window.toggleUser = function (uid, disabled) {
    db.ref("users/" + uid + "/disabled").set(disabled)
      .then(() => showToast("User " + (disabled ? "disabled" : "enabled") + ".", "info"));
  };

  window.deleteUserRecord = function (uid) {
    const u = allUsers[uid] || {};
    if (!confirm("Delete DB record for " + (u.name || uid) + "? (Auth account stays — use Firebase Console to remove it fully.)")) return;
    db.ref("users/" + uid).remove()
      .then(() => showToast("User record deleted.", "danger"));
  };

  // ======================== HELPERS ========================

  function populateOwnerSelect() {
    const sel = document.getElementById("mDevOwner");
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Unassigned —</option>' +
      Object.entries(allUsers).map(([uid, u]) =>
        `<option value="${uid}" ${cur===uid?"selected":""}>${u.name} (${u.email})</option>`
      ).join("");
  }

  function populateAssignUserSel() {
    const sel = document.getElementById("assignUserSel");
    sel.innerHTML = '<option value="">— Unassigned —</option>' +
      Object.entries(allUsers).map(([uid, u]) =>
        `<option value="${uid}">${u.name} (${u.email})</option>`
      ).join("");
  }

  window.closeModal = function (id) {
    document.getElementById(id).classList.remove("open");
  };

})();

// Tab switching
function switchTab(name) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  event.currentTarget.classList.add("active");
}
