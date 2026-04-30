import { state } from "../../backend/database.js";
import { binStations, recordsTable, renderBins, sectionTitle, stat, escapeHtml } from "../shared/templates.js";
import { renderUserPage } from "../user/pages.js";

const rewardImageSrc = (reward) => {
  if (reward.image) return reward.image;
  const name = reward.name.toLowerCase();
  if (name.includes("rm5")) return "/images/redeem/reoladpinRM5.png";
  if (name.includes("rm10")) return "/images/redeem/reloadpinRM10.png";
  if (name.includes("rm30")) return "/images/redeem/reloadpinRM30.png";
  if (name.includes("electricity")) return "/images/redeem/electricalbill.png";
  if (name.includes("water")) return "/images/redeem/waterbill.png";
  return "/images/redeem/reloadpinRM10.png";
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
  const pointsIssued = state.records.filter((record) => record.points > 0).length;
  const pendingRequests = state.redeemed.filter((item) => item.status === "Pending").length;
  const problemBins = state.bins.filter((bin) => bin.status !== "Available");
  const recentRecords = state.records.slice(0, 5);
  const recentRequests = state.redeemed.slice(0, 4);

  return `
    <section class="page admin-dashboard">
      <div class="dashboard-header">
        ${sectionTitle("Admin Dashboard", "Monitor system health, pending work, and recycling activity from one place.")}
        <div class="dashboard-actions">
          <button class="btn btn-outline-success" data-page="manage-users">Manage Users</button>
          <button class="btn btn-outline-success" data-page="manage-rewards">Manage Items</button>
          <button class="btn btn-outline-success" data-page="reports">View Reports</button>
          <button class="btn btn-success" data-page="redemptions">Review Requests</button>
        </div>
      </div>

      <div class="grid-4 dashboard-stats">
        ${stat("Total Users", totalUsers)}
        ${stat("Total Scans", totalScans)}
        ${stat("Points Issued", pointsIssued)}
        ${stat("Pending Requests", pendingRequests)}
      </div>

      <div class="dashboard-layout">
        <section class="panel card shadow-sm">
          <div class="panel-head">
            <div><p class="eyebrow">Bin Operations</p><h2>Bin Status</h2></div>
            <button class="btn btn-sm btn-outline-success" data-page="manage-bins">Manage</button>
          </div>
          <div class="status-list">
            ${binStations().map((station) => `
              <div>
                <span><strong>${escapeHtml(station.name)}</strong><small>${station.bins.length} bins: Plastic, Paper, General Waste</small></span>
                <b class="badge ${station.bins.some((bin) => bin.status !== "Available") ? "maintenance" : "available"}">${station.bins.some((bin) => bin.status !== "Available") ? "Check" : "Available"}</b>
              </div>
            `).join("")}
          </div>
        </section>

        <section class="panel card shadow-sm">
          <div class="panel-head"><div><p class="eyebrow">Action Needed</p><h2>Pending Work</h2></div></div>
          <div class="work-list">
            <button data-page="redemptions"><strong>${pendingRequests}</strong><span>redemption requests waiting</span></button>
            <button data-page="bin-status"><strong>${problemBins.length}</strong><span>bins full, offline, or maintenance</span></button>
            <button data-page="manage-users"><strong>${totalUsers}</strong><span>registered users managed here</span></button>
          </div>
        </section>

        <section class="panel card shadow-sm wide-panel">
          <div class="panel-head">
            <div><p class="eyebrow">Latest Activity</p><h2>Waste Records</h2></div>
            <button class="btn btn-sm btn-outline-success" data-page="waste-records">Open Records</button>
          </div>
          ${miniRecords(recentRecords)}
        </section>

        <section class="panel card shadow-sm">
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

const renderManageBins = () => `
  <section class="page">
    ${sectionTitle("Manage Bins", "Each station has three bins. Update the status for Plastic, Paper, or General Waste separately.")}
    <div class="crud-toolbar">
      <button class="btn btn-success primary-btn" data-action="add-bin">Add Bin</button>
    </div>
    <div class="grid-3">
      ${binStations().map((station) => `
        <article class="card h-100 shadow-sm station-card">
          <p class="eyebrow">Smart Bin Station</p>
          <h2>${escapeHtml(station.name)}</h2>
          <p>${escapeHtml(station.location)}</p>
          <div class="station-bin-set">
            ${station.bins.map((bin) => `
              <label class="station-bin ${bin.accepts.toLowerCase()}">
                <strong>${escapeHtml(bin.accepts)}</strong>
                <span>${escapeHtml(bin.id)}</span>
                <select data-bin-status="${bin.id}">
                  ${["Available", "Full", "Maintenance", "Offline"].map((status) => `<option ${bin.status === status ? "selected" : ""}>${status}</option>`).join("")}
                </select>
              </label>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  </section>
`;

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
    ${sectionTitle("Manage Users", "Admins can view points, penalties, redemption history, and suspicious activity. Passwords are not shown.")}
    <section class="panel card shadow-sm mb-3">
      <h2>Add User</h2>
      <form class="inline-form crud-form" data-form="add-user">
        <input name="name" placeholder="Full name" required>
        <input name="email" type="email" placeholder="Email" required>
        <input name="password" type="password" placeholder="Password" required>
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
          <div class="mini-row"><span>${user.points} points</span><span>${user.penalties} penalties</span></div>
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
          ${stat("Penalties", selectedUser.penalties)}
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
          <input name="password" type="password" placeholder="New password (optional)">
          <button class="btn btn-success primary-btn" type="submit">Save User</button>
        </form>
      </section>
    </section>
  `;
};

const renderManageRewards = () => `
  <section class="page">
    ${sectionTitle("Manage Redeem Items", "Add items with image upload, then update image or remove items anytime.")}
    <form class="inline-form crud-form" data-form="add-reward">
      <label class="profile-field">Item Name<input name="name" placeholder="Item name" value="${escapeHtml(state.newItem.name)}"></label>
      <label class="profile-field">Description<input name="desc" placeholder="Item description" value="${escapeHtml(state.newItem.desc || "")}"></label>
      <label class="profile-field">Points Required<input name="points" type="number" min="1" value="${state.newItem.points}"></label>
      <label class="profile-field">Quantity in Stock<input name="stock" type="number" min="0" value="${state.newItem.stock}"></label>
      <label class="profile-field full">Upload Item Image<input name="newRewardImage" type="file" accept="image/*"></label>
      ${state.newItem.image ? `<img class="split-img" src="${escapeHtml(state.newItem.image)}" alt="New reward preview">` : ""}
      <button class="btn btn-success primary-btn" type="submit">Add Item</button>
    </form>
    <div class="grid-3">
      ${state.rewards.map((reward) => `
        <article class="card h-100 shadow-sm crud-card">
          <img src="${escapeHtml(state.rewardDrafts?.[reward.id]?.image || rewardImageSrc(reward))}" alt="${escapeHtml(reward.name)}">
          <h2>${escapeHtml(reward.name)}</h2>
          <p>${escapeHtml(reward.desc)}</p>
          <div class="mini-row"><span>${reward.points} pts</span><span>${reward.stock} quantity</span></div>
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
        </article>
      `).join("")}
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
  const totalPenalties = state.records.filter((record) => record.points < 0).length;
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
        ${stat("Penalty Records", totalPenalties)}
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
    ["User", "Email", "Issue", "Status", "Date"],
    state.feedback.map((item) => [item.user, item.email, item.issue, item.status, item.date])
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
  if (state.page === "penalty-management") return recordsTable("Penalty Management", state.records.filter((record) => record.points < 0));
  if (state.page === "manage-rewards") return renderManageRewards();
  if (state.page === "redemptions") return renderRedemptions();
  if (state.page === "reports") return renderReports();
  if (state.page === "profile") return renderUserPage();
  return renderAdminDashboard();
};
