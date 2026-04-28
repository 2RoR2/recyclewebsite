import { state } from "../../backend/database.js";
import { recordsTable, renderBins, sectionTitle, stat, escapeHtml } from "../shared/templates.js";
import { renderUserPage } from "../user/pages.js";

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
          <button class="btn btn-success" data-page="redemptions">Review Requests</button>
          <button class="btn btn-outline-success" data-page="reports">View Reports</button>
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
            ${state.bins.map((bin) => `
              <div>
                <span><strong>${escapeHtml(bin.name)}</strong><small>${escapeHtml(bin.location)}</small></span>
                <b class="badge ${bin.status.toLowerCase()}">${escapeHtml(bin.status)}</b>
              </div>
            `).join("")}
          </div>
        </section>

        <section class="panel card shadow-sm">
          <div class="panel-head"><div><p class="eyebrow">Action Needed</p><h2>Pending Work</h2></div></div>
          <div class="work-list">
            <button data-page="redemptions"><strong>${pendingRequests}</strong><span>redemption requests waiting</span></button>
            <button data-page="bin-status"><strong>${problemBins.length}</strong><span>bins full, offline, or maintenance</span></button>
            <button data-page="feedback-admin"><strong>${state.feedback.filter((item) => item.status === "Open").length}</strong><span>open feedback reports</span></button>
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
    ${sectionTitle("Manage QR Code", "Each QR contains a scan link with the bin ID. Users scan it, login if needed, then select the waste type.")}
    <div class="grid-3">${state.bins.map((bin) => `
      <article class="card">
        <canvas class="generated-qr" data-qr-bin="${escapeHtml(bin.id)}"></canvas>
        <h2>${escapeHtml(bin.name)}</h2>
        <p>${escapeHtml(bin.location)}</p>
        <span class="badge">${escapeHtml(bin.id)}</span>
        <p class="qr-url" data-qr-url-for="${escapeHtml(bin.id)}"></p>
      </article>
    `).join("")}</div>
  </section>
`;

const renderManageBins = () => `
  <section class="page">
    ${sectionTitle("Manage Bins", "Add, edit, remove, and update bin status.")}
    <button class="btn btn-success primary-btn" data-action="add-bin">Add Bin</button>
    <div class="grid-3">
      ${state.bins.map((bin) => `
        <article class="card h-100 shadow-sm">
          <h2>${escapeHtml(bin.name)}</h2>
          <p>${escapeHtml(bin.location)}</p>
          <select data-bin-status="${bin.id}">
            ${["Available", "Full", "Maintenance", "Offline"].map((status) => `<option ${bin.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </article>
      `).join("")}
    </div>
  </section>
`;

const renderManageUsers = () => `
  <section class="page">
    ${sectionTitle("Manage Users", "Admins can view points, penalties, redemption history, and suspicious activity. Passwords are not shown.")}
    <div class="grid-3">
      ${state.users.filter((user) => user.role === "user").map((user) => `
        <article class="card h-100 shadow-sm">
          <h2>${escapeHtml(user.name)}</h2>
          <p>${escapeHtml(user.email)}</p>
          <div class="mini-row"><span>${user.points} points</span><span>${user.penalties} penalties</span></div>
          <p>${state.redeemed.filter((item) => item.userId === user.id).length} redemptions</p>
          <div class="row"><button class="btn btn-success" data-adjust="${user.id}:1">+1</button><button class="btn btn-outline-danger" data-adjust="${user.id}:-1">-1</button></div>
        </article>
      `).join("")}
    </div>
  </section>
`;

const renderManageRewards = () => `
  <section class="page">
    ${sectionTitle("Manage Redeem Items", "Add, edit, or delete redeemable items.")}
    <form class="inline-form" data-form="add-reward">
      <input name="name" placeholder="Item name" value="${escapeHtml(state.newItem.name)}">
      <input name="points" type="number" min="1" value="${state.newItem.points}">
      <input name="stock" type="number" min="0" value="${state.newItem.stock}">
      <button class="btn btn-success primary-btn" type="submit">Add Item</button>
    </form>
    <div class="grid-3">
      ${state.rewards.map((reward) => `
        <article class="card h-100 shadow-sm">
          <h2>${escapeHtml(reward.name)}</h2>
          <div class="mini-row"><span>${reward.points} pts</span><span>${reward.stock} stock</span></div>
          <button class="btn btn-danger danger-btn" data-delete-reward="${reward.id}">Delete</button>
        </article>
      `).join("")}
    </div>
  </section>
`;

const renderManageQuiz = () => `
  <section class="page">
    ${sectionTitle("Manage Quiz", "Add or remove quiz questions for the user recycle quiz.")}
    <form class="quiz-admin-form panel card shadow-sm" data-form="add-quiz">
      <input name="question" placeholder="Question" value="${escapeHtml(state.newQuiz.question)}">
      <input name="option1" placeholder="Option 1" value="${escapeHtml(state.newQuiz.option1)}">
      <input name="option2" placeholder="Option 2" value="${escapeHtml(state.newQuiz.option2)}">
      <input name="option3" placeholder="Option 3" value="${escapeHtml(state.newQuiz.option3)}">
      <input name="answer" placeholder="Correct answer" value="${escapeHtml(state.newQuiz.answer)}">
      <button class="btn btn-success primary-btn" type="submit">Add Question</button>
    </form>
    <div class="grid-3">
      ${state.quizQuestions.map((question) => `
        <article class="card h-100 shadow-sm">
          <h2>${escapeHtml(question.question)}</h2>
          <div class="mini-row">${question.options.map((option) => `<span>${escapeHtml(option)}</span>`).join("")}</div>
          <p>Answer: ${escapeHtml(question.answer)}</p>
          <button class="btn btn-danger danger-btn" data-delete-quiz="${escapeHtml(question.id)}">Delete</button>
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
        <article class="card h-100 shadow-sm">
          <h2>${escapeHtml(item.item)}</h2>
          <p>${escapeHtml(item.user)} - ${escapeHtml(item.code)}</p>
          <span class="badge">${escapeHtml(item.status)}</span>
          <div class="row">
            <button class="btn btn-success" data-redemption="${item.id}:Approved">Approve</button>
            <button class="btn btn-outline-danger" data-redemption="${item.id}:Rejected">Reject</button>
            <button class="btn btn-outline-success" data-redemption="${item.id}:Collected">Collected</button>
          </div>
        </article>
      `).join("")}
    </div>
  </section>
`;

const renderReports = () => `
  <section class="page">
    ${sectionTitle("Reports", "Recycling statistics, most used bin, top users, waste records, and reward usage.")}
    <div class="grid-4">
      ${stat("Total Rubbish Records", state.records.length)}
      ${stat("Top Users", state.users.filter((user) => user.role === "user").length)}
      ${stat("Most Used Bin", state.records[0]?.bin || state.bins[0].name)}
      ${stat("Reward Usage", state.redeemed.length)}
    </div>
    <div class="panel card shadow-sm">
      <h2>System Activity Chart</h2>
      <canvas id="reportChart" height="120"></canvas>
    </div>
  </section>
`;

const renderFeedbackAdmin = () => `
  <section class="page">
    ${sectionTitle("Feedback Management", "Reply to user reports and update issue status.")}
    <div class="grid-3">
      ${state.feedback.length === 0 ? "<p>No feedback yet.</p>" : state.feedback.map((item) => `
        <article class="card h-100 shadow-sm">
          <p class="eyebrow">Sent by</p>
          <h2>${escapeHtml(item.user)}</h2>
          <div class="mini-row">
            <span>${escapeHtml(item.email)}</span>
            <span>${item.userId ? `User ID ${escapeHtml(item.userId)}` : "Guest"}</span>
          </div>
          <p>${escapeHtml(item.issue)}</p>
          <small>${escapeHtml(item.date)}</small>
          <span class="badge">${escapeHtml(item.status)}</span>
          <button class="btn btn-success" data-feedback="${item.id}">Mark Resolved</button>
        </article>
      `).join("")}
    </div>
  </section>
`;

const renderAnnouncement = () => `
  <section class="page grid-2">
    <img class="split-img" src="/images/recycle-rewards.png" alt="">
    <div>
      ${sectionTitle("Announcement", "Post campaign, reward, or bin maintenance notices here.")}
      <ul class="lead">
        <li>Recycle plastic this week for campaign points.</li>
        <li>Cafeteria bin is under maintenance.</li>
        <li>New rewards added monthly.</li>
      </ul>
    </div>
  </section>
`;

export const renderAdminPage = () => {
  if (state.page === "manage-qr") return renderQrManager();
  if (state.page === "manage-bins") return renderManageBins();
  if (state.page === "bin-status") return renderBins({ admin: true });
  if (state.page === "waste-records") return recordsTable("All Waste Records", state.records);
  if (state.page === "manage-users" || state.page === "points-management") return renderManageUsers();
  if (state.page === "penalty-management") return recordsTable("Penalty Management", state.records.filter((record) => record.points < 0));
  if (state.page === "manage-rewards") return renderManageRewards();
  if (state.page === "manage-quiz") return renderManageQuiz();
  if (state.page === "redemptions") return renderRedemptions();
  if (state.page === "reports") return renderReports();
  if (state.page === "feedback-admin") return renderFeedbackAdmin();
  if (state.page === "announcement") return renderAnnouncement();
  if (state.page === "profile") return renderUserPage();
  return renderAdminDashboard();
};
