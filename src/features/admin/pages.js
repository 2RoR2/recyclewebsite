import { state } from "../../backend/database.js";
import { binStations, recordsTable, renderBins, sectionTitle, stat, escapeHtml } from "../shared/templates.js";
import { renderUserPage } from "../user/pages.js";

const rewardImageSrc = (reward) => {
  if (reward.image) return reward.image;
  const name = reward.name.toLowerCase();
  if (name.includes("rm5")) return "reloadpinRM5.png";
  if (name.includes("rm10")) return "reloadpinRM10.png";
  if (name.includes("rm30")) return "reloadpinRM30.png";
  if (name.includes("electricity")) return "electricalbill.jpeg";
  if (name.includes("water")) return "waterbill.jpeg";
  if (name.includes("emart")) return "emart.jpeg";
  if (name.includes("rainforest")) return "rainforest.jpeg";
  return "reloadpinRM10.png";
};

const miniRecords = (records) => `
  <div class="table-wrap compact-table">
    <table>
      <thead><tr><th>User</th><th>Waste</th><th>Bin</th><th>Points</th><th>Date</th></tr></thead>
      <tbody>
        ${records.length === 0 ? `<tr><td colspan="5">No records yet.</td></tr>` : records.map((record) => `
          <tr>
            <td>${escapeHtml(record.user)}</td>
            <td>${escapeHtml(record.waste)}</td>
            <td>${escapeHtml(record.bin)}</td>
            <td>${record.points}</td>
            <td>${escapeHtml(record.date)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>
`;

const reportTable = (title, headers, rows) => `
  <section class="panel card shadow-sm report-section">
    <div class="panel-head">
      <h2>${escapeHtml(title)}</h2>
      <span class="badge">${rows.length} records</span>
    </div>
    <div class="table-wrap compact-table">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.length === 0
    ? `<tr><td colspan="${headers.length}">No records found.</td></tr>`
    : rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>
`;

const renderAdminDashboard = () => {
  const totalUsers = state.users.filter((user) => user.role === "user").length;
  const totalScans = state.records.length;
  const validScans = state.records.filter((record) => record.points > 0).length;
  const pendingRequests = state.redeemed.filter((item) => item.status === "Pending").length;
  const problemBins = state.bins.filter((bin) => bin.status !== "Available");
  const recentRecords = state.records.slice(0, 5);
  const recentRequests = state.redeemed.slice(0, 5);

  return `
    <section class="page admin-dashboard">
      <div class="dashboard-header">
        <div class="header-text">
          <p class="eyebrow">ECOCYCLE SARAWAK</p>
          <h1>Admin Dashboard</h1>
          <p>Monitor system health, pending work, and recycling activity from one place.</p>
          <div class="admin-dashboard-kpis" aria-label="Admin dashboard summary">
            <span><b>${totalUsers}</b>Users</span>
            <span><b>${totalScans}</b>Scans</span>
            <span><b>${validScans}</b>Valid</span>
            <span><b>${pendingRequests}</b>Pending</span>
          </div>
        </div>
        <div class="dashboard-actions">
          <button class="btn btn-light" data-page="manage-users">Manage Users</button>
          <button class="btn btn-light" data-page="manage-rewards">Manage Items</button>
          <button class="btn btn-light" data-page="reports">View Reports</button>
          <button class="btn btn-dark" data-page="redemptions">Review Requests</button>
        </div>
      </div>

      <div class="dashboard-layout admin-dashboard-grid">
        <section class="panel card shadow-sm dashboard-action-panel">
          <div class="panel-head"><div><p class="eyebrow">Action Needed</p><h2>Pending Work</h2></div></div>
          <div class="work-list">
            <button data-page="redemptions"><strong>${pendingRequests}</strong><span>redemption requests waiting</span></button>
            <button data-page="bin-status"><strong>${problemBins.length}</strong><span>bins full, offline, or maintenance</span></button>
            <button data-page="manage-users"><strong>${totalUsers}</strong><span>registered users managed here</span></button>
          </div>
        </section>

        <section class="panel card shadow-sm dashboard-requests-panel">
          <div class="panel-head">
            <div><p class="eyebrow">Rewards</p><h2>Recent Requests</h2></div>
            <button class="btn btn-sm btn-outline-success" data-page="redemptions">Open</button>
          </div>
          <div class="request-list">
            ${recentRequests.length === 0 ? `<p class="lead">No redemption requests yet.</p>` : recentRequests.map((item) => `
              <div>
                <span><strong>${escapeHtml(item.item)}</strong><small>${escapeHtml(item.user)} - ${escapeHtml(item.code)}</small></span>
                <b class="badge">${escapeHtml(item.status)}</b>
              </div>
            `).join("")}
          </div>
        </section>

        <section class="panel card shadow-sm dashboard-bin-panel">
          <div class="panel-head">
            <div><p class="eyebrow">Bin Operations</p><h2>Bin Status</h2></div>
            <button class="btn btn-sm btn-outline-success" data-page="manage-bins">Manage</button>
          </div>
          <div class="status-list">
            ${binStations().map((station) => `
              <div>
                <span><strong>${escapeHtml(station.name)}</strong><small>${station.bins.length} bins: Paper, Plastic, Aluminium, General Waste</small></span>
                <b class="badge ${station.bins.some((bin) => bin.status !== "Available") ? "maintenance" : "available"}">${station.bins.some((bin) => bin.status !== "Available") ? "Check" : "Available"}</b>
              </div>
            `).join("")}
          </div>
        </section>

        <section class="panel card shadow-sm dashboard-records-panel">
          <div class="panel-head">
            <div><p class="eyebrow">Latest Activity</p><h2>Waste Records</h2></div>
            <button class="btn btn-sm btn-outline-success" data-page="waste-records">Open Records</button>
          </div>
          ${miniRecords(recentRecords)}
        </section>
      </div>
    </section>
  `;
};

const renderQrManager = () => `
  <section class="page">
    ${sectionTitle("Manage QR Code", "Each location has one QR code linked to the station location.")}
    <div class="grid-3">${binStations().map((station) => `
      <article class="card station-card">
        <p class="eyebrow">Location QR</p>
        <h2>${escapeHtml(station.name)}</h2>
        <p>${escapeHtml(station.location)}</p>
        <div class="station-location-qr">
          <canvas class="generated-qr" data-qr-station="${escapeHtml(station.code)}"></canvas>
          <strong>${escapeHtml(station.code)}</strong>
          <p class="qr-url" data-qr-url-for-station="${escapeHtml(station.code)}"></p>
        </div>
      </article>
    `).join("")}</div>
  </section>
`;

const renderManageBins = () => {
  const stations = binStations();
  const totalBins = state.bins.length;
  const availableBins = state.bins.filter((bin) => bin.status === "Available").length;
  const attentionBins = state.bins.filter((bin) => bin.status !== "Available").length;
  const statusOptions = ["Available", "Full", "Maintenance", "Offline"];
  const categoryOptions = ["Paper", "Plastic", "Aluminium", "General Waste"];
  const categoryClass = (category) => category.toLowerCase().replaceAll(" ", "-");
  const optionList = (options, selected) => options.map((option) => `<option value="${escapeHtml(option)}" ${selected === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
  const stationOptions = [...new Set(stations.map((station) => station.name))];

  return `
  <section class="page admin-bin-page">
    <div class="admin-bin-hero">
      <div>
        <p class="eyebrow">Bin Operations</p>
        <h1>Manage Bins</h1>
        <p class="lead">Create, read, update, and delete every smart-bin record. Changes are saved to the app database and sync queue.</p>
      </div>
    </div>

    <section class="admin-bin-create panel card shadow-sm">
      <div class="panel-head">
        <div><p class="eyebrow">Create Bin</p><h2>Add new smart bin</h2></div>
      </div>
      <form class="admin-bin-edit-form" data-form="add-bin">
        <label>Station<input name="station" list="adminStationOptions" placeholder="Example: Saradise" required></label>
        <label>Bin Name<input name="name" placeholder="Example: Saradise Plastic Bin" required></label>
        <label>Location<input name="location" placeholder="Example: Saradise, Kuching" required></label>
        <label>Category<select name="accepts">${optionList(categoryOptions, "Plastic")}</select></label>
        <label>Status<select name="status">${optionList(statusOptions, "Available")}</select></label>
        <label>QR Code<input name="qrCode" placeholder="Auto: SAR-PLA" required></label>
        <label>Latitude<input name="lat" type="number" step="0.000001" value="1.51983"></label>
        <label>Longitude<input name="lng" type="number" step="0.000001" value="110.351"></label>
        <label>Map X<input name="mapX" type="number" min="0" max="100" value="50"></label>
        <label>Map Y<input name="mapY" type="number" min="0" max="100" value="50"></label>
        <div class="admin-bin-qr-preview">
          <canvas data-bin-qr-preview></canvas>
          <span data-bin-qr-url>QR preview updates automatically</span>
        </div>
        <button class="btn btn-success primary-btn" type="submit">Create Bin</button>
      </form>
      <datalist id="adminStationOptions">
        ${stationOptions.map((stationName) => `<option value="${escapeHtml(stationName)}"></option>`).join("")}
      </datalist>
    </section>

    <div class="admin-bin-stats">
      ${stat("Stations", stations.length)}
      ${stat("Total Bins", totalBins)}
      ${stat("Available", availableBins)}
      ${stat("Need Attention", attentionBins)}
    </div>

    <div class="admin-bin-grid">
      ${stations.map((station) => {
        const offlineCount = station.bins.filter((bin) => bin.status !== "Available").length;
        const stationStatus = offlineCount ? `${offlineCount} need check` : "All available";
        return `
        <article class="admin-bin-card">
          <div class="admin-bin-card-head">
            <div>
              <p class="eyebrow">Smart Bin Station</p>
              <h2>${escapeHtml(station.name)}</h2>
              <p>${escapeHtml(station.location)}</p>
            </div>
            <span class="admin-bin-status ${offlineCount ? "attention" : "available"}">${escapeHtml(stationStatus)}</span>
          </div>
          <div class="admin-bin-list">
            ${station.bins.map((bin) => `
              <details class="admin-bin-row ${categoryClass(bin.accepts)} ${bin.status.toLowerCase()}">
                <summary>
                  <span class="admin-bin-type">
                    <b>${escapeHtml(bin.accepts)}</b>
                    <small>${escapeHtml(bin.id)} · ${escapeHtml(bin.qrCode || "No QR")}</small>
                  </span>
                  <span>${escapeHtml(bin.name)}</span>
                  <span class="admin-bin-current ${bin.status.toLowerCase()}">${escapeHtml(bin.status)}</span>
                </summary>
                <form class="admin-bin-edit-form" data-form="edit-bin">
                  <input name="binId" type="hidden" value="${escapeHtml(bin.id)}">
                  <label>Station<input name="station" list="adminStationOptions" value="${escapeHtml(bin.station || station.name)}" required></label>
                  <label>Bin Name<input name="name" value="${escapeHtml(bin.name)}" required></label>
                  <label>Location<input name="location" value="${escapeHtml(bin.location)}" required></label>
                  <label>Category<select name="accepts">${optionList(categoryOptions, bin.accepts)}</select></label>
                  <label>Status<select name="status">${optionList(statusOptions, bin.status)}</select></label>
                  <label>QR Code<input name="qrCode" value="${escapeHtml(bin.qrCode || "")}" required></label>
                  <label>Latitude<input name="lat" type="number" step="0.000001" value="${bin.lat || ""}"></label>
                  <label>Longitude<input name="lng" type="number" step="0.000001" value="${bin.lng || ""}"></label>
                  <label>Map X<input name="mapX" type="number" min="0" max="100" value="${bin.mapX || 50}"></label>
                  <label>Map Y<input name="mapY" type="number" min="0" max="100" value="${bin.mapY || 50}"></label>
                  <div class="admin-bin-qr-preview">
                    <canvas data-bin-qr-preview></canvas>
                    <span data-bin-qr-url>QR preview updates automatically</span>
                  </div>
                  <div class="admin-bin-form-actions">
                    <button class="btn btn-success primary-btn" type="submit">Save Bin</button>
                    <button class="btn btn-danger danger-btn" type="button" data-delete-bin="${escapeHtml(bin.id)}">Delete Bin</button>
                  </div>
                </form>
              </details>
            `).join("")}
          </div>
        </article>
      `; }).join("")}
    </div>
  </section>
`;
};

const renderManageUsers = () => `
  ${(() => {
    const filterText = String(state.adminUserFilterText || "").trim().toLowerCase();
    const users = state.users.filter((user) => user.role === "user");
    const filteredUsers = users.filter((user) =>
      !filterText
      || user.name.toLowerCase().includes(filterText)
      || user.email.toLowerCase().includes(filterText)
      || (user.location || "").toLowerCase().includes(filterText)
    );

    return `
  <section class="page">
    ${sectionTitle("Manage Users", "Admins can view points, redemption history, and account activity. Passwords are not shown.")}
    <section class="panel card shadow-sm mb-3">
      <h2>Add User</h2>
      <form class="inline-form crud-form" data-form="add-user">
        <input name="name" placeholder="Full name" required>
        <input name="email" type="email" placeholder="Email" required>
        <span class="password-control">
          <input name="password" type="password" placeholder="Password" required>
          <button class="password-toggle" type="button" data-password-toggle aria-label="Show password" title="Show password"><span class="password-eye" aria-hidden="true"></span></button>
        </span>
        <input name="location" placeholder="Location (optional)">
        <button class="btn btn-success primary-btn" type="submit">Add User</button>
      </form>
    </section>
    <div class="inline-form crud-toolbar">
      <input data-admin-user-filter type="search" placeholder="Filter users by name, email, or location" value="${escapeHtml(state.adminUserFilterText)}">
    </div>
    <div class="grid-3">
      ${filteredUsers.map((user) => `
        <article class="card h-100 shadow-sm crud-card">
          <h2>${escapeHtml(user.name)}</h2>
          <p>${escapeHtml(user.email)}</p>
          <div class="mini-row"><span>${user.points} points</span><span>${state.records.filter((record) => record.userId === user.id).length} records</span></div>
          <p>${state.redeemed.filter((item) => item.userId === user.id).length} redemptions</p>
          <div class="row crud-actions">
            <button class="btn btn-success" data-adjust="${user.id}:1">+1 Point</button>
            <button class="btn btn-outline-danger" data-adjust="${user.id}:-1">-1 Point</button>
            <button class="btn btn-outline-success" data-manage-user="${user.id}">View Detail</button>
          </div>
        </article>
      `).join("")}
    </div>
    ${filteredUsers.length === 0 ? `<p>No user matched this filter.</p>` : ""}
  </section>
`;
  })()}
`;

const renderManageUserDetail = () => {
  const users = state.users.filter((user) => user.role === "user");
  const selectedUser = users.find((user) => user.id === state.selectedManagedUserId) || users[0] || null;
  if (!selectedUser) {
    return `
      <section class="page">
        ${sectionTitle("User Detail", "No user selected.")}
        <button class="btn btn-outline-success btn-sm" data-page="manage-users">Back</button>
      </section>
    `;
  }

  const userRecords = state.records.filter((record) => record.userId === selectedUser.id);
  const userFeedback = state.feedback.filter((item) => item.userId === selectedUser.id || item.email === selectedUser.email);

  return `
    <section class="page">
      ${sectionTitle("User Detail", "Detailed record for selected user.")}
      <div class="row">
        <button class="btn btn-outline-success btn-sm mb-3" style="width:auto;" data-page="manage-users">Back</button>
      </div>
      <section class="panel card shadow-sm">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Selected User</p>
            <h2>${escapeHtml(selectedUser.name)}</h2>
            <p>${escapeHtml(selectedUser.email)} | ${escapeHtml(selectedUser.location || "No location")}</p>
          </div>
          <div class="row crud-actions">
            <button class="btn btn-success" data-adjust="${selectedUser.id}:1">+1 Point</button>
            <button class="btn btn-outline-danger" data-adjust="${selectedUser.id}:-1">-1 Point</button>
            <button class="btn btn-danger danger-btn" data-delete-user="${selectedUser.id}">Delete User</button>
          </div>
        </div>
        <div class="grid-3">
          ${stat("Points", selectedUser.points)}
          ${stat("Waste Records", userRecords.length)}
          ${stat("Redemptions", state.redeemed.filter((item) => item.userId === selectedUser.id).length)}
        </div>
        <h2>User Waste History</h2>
        ${miniRecords(userRecords)}
        <h2>User Feedback</h2>
        <div class="grid-3">
          ${userFeedback.length === 0 ? "<p>No feedback from this user.</p>" : userFeedback.map((item) => `
            <article class="card h-100 shadow-sm">
              <p>${escapeHtml(item.issue)}</p>
              <small>${escapeHtml(item.date)}</small>
              <span class="badge">${escapeHtml(item.status)}</span>
            </article>
          `).join("")}
        </div>
        <h2>Edit User</h2>
        <form class="inline-form crud-form" data-form="edit-managed-user">
          <input name="userId" type="hidden" value="${selectedUser.id}">
          <input name="name" value="${escapeHtml(selectedUser.name)}" placeholder="Name">
          <input name="email" type="email" value="${escapeHtml(selectedUser.email)}" placeholder="Email">
          <input name="location" value="${escapeHtml(selectedUser.location || "")}" placeholder="Location">
          <span class="password-control">
            <input name="password" type="password" placeholder="New password (optional)">
            <button class="password-toggle" type="button" data-password-toggle aria-label="Show password" title="Show password"><span class="password-eye" aria-hidden="true"></span></button>
          </span>
          <button class="btn btn-success primary-btn" type="submit">Save User</button>
        </form>
      </section>
    </section>
  `;
};

const renderManageRewards = () => `
  <section class="page">
    ${sectionTitle("Redeem Inventory", "Manage rewards items, points costs, and stock levels.")}
    <section class="panel card shadow-sm mb-4">
      <div class="panel-head"><h2>Add New Reward</h2></div>
      <form class="crud-form" data-form="add-reward" style="display: grid; gap: 1rem;">
        <div class="profile-form-grid">
          <label class="profile-field">Item Name<input name="name" placeholder="Example: TNG Voucher" value="${escapeHtml(state.newItem.name)}"></label>
          <label class="profile-field">Description<input name="desc" placeholder="Short description" value="${escapeHtml(state.newItem.desc || "")}"></label>
          <label class="profile-field">Points Required<input name="points" type="number" min="1" value="${state.newItem.points}"></label>
          <label class="profile-field">Initial Stock<input name="stock" type="number" min="0" value="${state.newItem.stock}"></label>
          <label class="profile-field full">Item Image
            <input name="newRewardImage" type="file" accept="image/*">
            ${state.newItem.image ? `<img class="split-img mt-2" style="max-height: 120px; width: auto;" src="${escapeHtml(state.newItem.image)}" alt="Preview">` : ""}
          </label>
        </div>
        <button class="btn btn-success primary-btn" style="width: fit-content;" type="submit">Create Reward</button>
      </form>
    </section>

    <div class="grid-3">
      ${state.rewards.map((reward) => {
        const rawImg = state.rewardDrafts?.[reward.id]?.image || rewardImageSrc(reward);
        const imgSrc = rawImg.startsWith("data:") || rawImg.startsWith("/") ? rawImg : `/images/redeem/${rawImg}`;
        return `
        <article class="card h-100 shadow-sm crud-card" style="padding: 0; overflow: hidden;">
          <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(reward.name)}" style="height: 180px; width: 100%; object-fit: cover;">
          <div style="padding: 1.2rem; display: grid; gap: 0.8rem;">
            <h2 style="margin: 0;">${escapeHtml(reward.name)}</h2>
            <p style="margin: 0; font-size: 0.9rem;">${escapeHtml(reward.desc)}</p>
            <div class="mini-row"><span>${reward.points} pts</span><span>${reward.stock} stock</span></div>
          <label class="profile-field">Edit Points
            <input data-reward-points="${reward.id}" type="number" min="1" value="${reward.points}">
          </label>
          <label class="profile-field">Edit Quantity
            <input data-reward-stock="${reward.id}" type="number" min="0" value="${reward.stock}">
          </label>
          <label class="profile-field">Change Image<input data-reward-image="${reward.id}" type="file" accept="image/*"></label>
          <div class="row crud-actions">
            <button class="btn btn-success" data-save-reward="${reward.id}">Save</button>
            <button class="btn btn-danger danger-btn" data-delete-reward="${reward.id}">Delete</button>
          </div>
          </div>
        </article>
      `; }).join("")}
    </div>
  </section>
`;

const renderRedemptions = () => `
  <section class="page">
    ${sectionTitle("Redemption Requests", "Approve, reject, or mark item collection as completed.")}
    <div class="grid-3">
      ${state.redeemed.length === 0 ? "<p>No requests yet.</p>" : state.redeemed.map((item) => `
        <article class="card h-100 shadow-sm crud-card">
          <h2>${escapeHtml(item.item)}</h2>
          <p>${escapeHtml(item.user)} - ${escapeHtml(item.code)}</p>
          <span class="badge redemption-status ${String(item.status).toLowerCase()}">${escapeHtml(item.status)}</span>
          <div class="row crud-actions">
            <button class="btn btn-success" data-redemption="${item.id}:Approved">Approve</button>
            <button class="btn btn-outline-danger" data-redemption="${item.id}:Rejected">Reject</button>
            <button class="btn btn-outline-success" data-redemption="${item.id}:Collected">Collected</button>
          </div>
        </article>
      `).join("")}
    </div>
  </section>
`;

const renderReports = () => {
  const testedRecords = state.records.filter((record) => record.locationVerified);
  const correctDetections = testedRecords.filter((record) => record.status === "Valid").length;
  const accuracy = testedRecords.length ? Math.round((correctDetections / testedRecords.length) * 100) : 0;
  const totalError = testedRecords.reduce((sum, record) => sum + (record.detectionError || 0), 0);
  const totalLearning = state.learningRecords.length;
  const totalFeedback = state.feedback.length;

  return `
    <section class="page report-page" id="adminFullReport">
      ${sectionTitle("Reports", "Recycling statistics, most used bin, top users, waste records, reward usage, and prototype detection accuracy.")}
      <div class="crud-toolbar no-print">
        <button class="btn btn-success primary-btn" data-action="export-report-pdf">Save as PDF</button>
      </div>
      <div class="grid-4">
        ${stat("Total Rubbish Records", state.records.length)}
        ${stat("Top Users", state.users.filter((user) => user.role === "user").length)}
        ${stat("Most Used Bin", state.records[0]?.bin || state.bins[0].name)}
        ${stat("Reward Usage", state.redeemed.length)}
      </div>
      <div class="grid-4">
        ${stat("Accuracy", `${accuracy}%`)}
        ${stat("Correct Detections", correctDetections)}
        ${stat("Total Tests", testedRecords.length)}
        ${stat("Detection Error", totalError)}
      </div>
      <div class="grid-4">
        ${stat("Valid Records", state.records.filter((record) => record.points > 0).length)}
        ${stat("Learning Records", totalLearning)}
        ${stat("Feedback Records", totalFeedback)}
        ${stat("Redemption Records", state.redeemed.length)}
      </div>
      <div class="panel card shadow-sm">
        <h2>System Activity Chart</h2>
        <canvas id="reportChart" height="120"></canvas>
      </div>
      ${reportTable(
    "Waste Records",
    ["User", "Waste", "Detected Category", "Bin", "Points", "Status", "Date"],
    state.records.map((record) => [
      record.user,
      record.waste,
      record.detectedCategory || "",
      record.bin,
      record.points,
      record.status,
      record.date,
    ])
  )}
      ${reportTable(
    "Redemption Records",
    ["User", "Item", "Points", "Status", "Code", "Date"],
    state.redeemed.map((item) => [item.user, item.item, item.points, item.status, item.code, item.date])
  )}
      ${reportTable(
    "Learning Records",
    ["User", "Type", "Item", "Answer", "Correct Answer", "Score", "Date"],
    state.learningRecords.map((item) => [
      item.user,
      item.type,
      item.item,
      item.answer,
      item.correctAnswer,
      `${item.score}/${item.total}`,
      item.date,
    ])
  )}
      ${reportTable(
    "User Feedback",
    ["User", "Email", "Category", "Source", "Issue", "Status", "Date"],
    state.feedback.map((item) => [item.user, item.email, item.category || "General feedback", item.source || "Contact form", item.issue, item.status, item.date])
  )}
    </section>
  `;
};

export const renderAdminPage = () => {
  if (state.page === "manage-qr") return renderQrManager();
  if (state.page === "manage-bins") return renderManageBins();
  if (state.page === "bin-status") return renderBins({ admin: true });
  if (state.page === "waste-records") return recordsTable("All Waste Records", state.records);
  if (state.page === "manage-users" || state.page === "points-management") return renderManageUsers();
  if (state.page === "manage-user-detail") return renderManageUserDetail();
  if (state.page === "manage-rewards") return renderManageRewards();
  if (state.page === "redemptions") return renderRedemptions();
  if (state.page === "reports") return renderReports();
  if (state.page === "profile") return renderUserPage();
  return renderAdminDashboard();
};
