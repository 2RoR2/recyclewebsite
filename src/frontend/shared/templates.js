import { state } from "../../backend/database.js";
import { role } from "../../backend/services.js";

export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const sectionTitle = (title, text = "") => `
  <div class="section-title mb-4">
    <p class="eyebrow">Smart Recycle</p>
    <h1>${escapeHtml(title)}</h1>
    ${text ? `<p class="lead">${escapeHtml(text)}</p>` : ""}
  </div>
`;

export const stat = (label, value) => `
  <article class="stat card shadow-sm">
    <p>${escapeHtml(label)}</p>
    <strong>${escapeHtml(value)}</strong>
  </article>
`;

export const actions = (items) => `
  <div class="action-grid">${items.map(([page, label]) => `<button data-page="${page}">${label}</button>`).join("")}</div>
`;

export const recordsTable = (title, records, embedded = false) => `
  <section class="${embedded ? "panel" : "page"}">
    ${embedded ? `<h2>${escapeHtml(title)}</h2>` : sectionTitle(title, "Scan records include waste type, points, bin location, and date/time.")}
    <div class="table-wrap">
      <table>
        <thead><tr><th>User</th><th>Waste</th><th>Bin</th><th>Points</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${records.length === 0 ? `<tr><td colspan="6">No records yet.</td></tr>` : records.map((record) => `
            <tr>
              <td>${escapeHtml(record.user)}</td>
              <td>${escapeHtml(record.waste)}</td>
              <td>${escapeHtml(record.bin)}</td>
              <td>${record.points}</td>
              <td>${escapeHtml(record.status)}</td>
              <td>${escapeHtml(record.date)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  </section>
`;

export const renderEducation = (wasteGuide) => `
  <section class="page education-page">
    ${sectionTitle("Waste Education Guide", "Learn what goes into each bin before you scan. Correct sorting keeps recycling useful and prevents contamination.")}
    <div class="education-grid">
      ${wasteGuide
        .map(
          ([type, example, tip]) => `
          <article class="card h-100 shadow-sm education-card">
            <span class="pill">${escapeHtml(type)}</span>
            <h2>${escapeHtml(example)}</h2>
            <p>${escapeHtml(tip)}</p>
          </article>
        `
        )
        .join("")}
    </div>
    <div class="panel card shadow-sm education-note">
      <div>
        <p class="eyebrow">Why penalties exist</p>
        <h2>Wrong bins reduce recycling quality</h2>
      </div>
      <p class="lead">If a user records the wrong bin or an invalid action, the system can deduct points. This keeps the reward system fair and teaches better disposal habits.</p>
      <button class="btn btn-success" data-page="${role() === "user" ? "scan" : "public-bins"}">${role() === "user" ? "Scan a Bin" : "View Bin Locations"}</button>
    </div>
  </section>
`;

export const renderBins = ({ guest = false, admin = false } = {}) => `
  <section class="page">
    ${sectionTitle(guest ? "Public Bin Location" : admin ? "Bin Status" : "Scan QR Page", guest ? "General bin locations and status." : "Scan the QR code placed on the smart bin. The system will detect the bin automatically.")}
    <div class="map-layout">
      <div class="leaflet-map panel shadow-sm" id="binMap"></div>
      <div class="map-list">
        ${!guest && !admin ? `
          <article class="scanner-card h-100 shadow-sm">
            <div class="scanner-copy">
              <p class="eyebrow">Bin QR</p>
              <h2>Scan Smart Bin</h2>
              <p>Point your camera at the QR code on the bin. The app will detect the bin before you choose the waste type.</p>
            </div>
            <button class="scanner-launch" id="scannerLaunch" data-action="start-scanner" aria-label="Open camera QR scanner" title="Open camera QR scanner">
              <span class="scanner-ring" aria-hidden="true"><span class="qr-icon"></span></span>
              <strong>Open Camera</strong>
            </button>
            <div id="qrReader" class="qr-reader hidden"></div>
            <div class="scanner-actions hidden" id="scannerActions">
              <button class="icon-btn scanner-icon stop" data-action="stop-scanner" aria-label="Stop QR scanner" title="Stop QR scanner">
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </article>
        ` : ""}
        ${state.bins.map((bin) => `
          <article class="card h-100 shadow-sm">
            <div class="qr-box">${escapeHtml(bin.id)}</div>
            <h2>${escapeHtml(bin.name)}</h2>
            <p>${escapeHtml(bin.location)}</p>
            <div class="mini-row"><span>${bin.lat.toFixed(5)}</span><span>${bin.lng.toFixed(5)}</span></div>
            <span class="pill">Accepts ${escapeHtml(bin.accepts)}</span>
            <span class="badge ${bin.status.toLowerCase()}">${escapeHtml(bin.status)}</span>
          </article>
        `).join("")}
      </div>
    </div>
  </section>
`;

export const renderRewards = ({ preview = false, user = null } = {}) => `
  <section class="page">
    ${sectionTitle(preview ? "Rewards Preview" : "Redeem Items", preview ? "Example redeemable items." : `Your points: ${user.points}`)}
    <div class="grid-3">
      ${state.rewards
        .map(
          (reward) => `
          <article class="card h-100 shadow-sm">
            <img src="/images/recycle-rewards.png" alt="">
            <h2>${escapeHtml(reward.name)}</h2>
            <p>${escapeHtml(reward.desc)}</p>
            <div class="mini-row"><span>${reward.points} points</span><span>${reward.stock} stock</span></div>
            ${preview ? "" : `<button class="btn btn-success" data-reward="${reward.id}">View Detail</button>`}
          </article>
        `
        )
        .join("")}
    </div>
  </section>
`;

export const renderContact = () => `
  <section class="page auth-wrap">
    <div class="panel auth-card card shadow-lg border-0">
      ${sectionTitle("Feedback", "Report bin problem, wrong points, scanner issue, or reward issue.")}
      <form class="form" data-form="feedback">
        <label>Issue<textarea name="issue">${escapeHtml(state.form.issue)}</textarea></label>
        <button class="btn btn-success primary-btn" type="submit">Submit Feedback</button>
      </form>
    </div>
  </section>
`;

export const renderNotFound = () => `
  <section class="page auth-wrap">
    <div class="panel auth-card card shadow-lg border-0 not-found-card">
      <p class="eyebrow">404 Error</p>
      <h1>Page Not Found</h1>
      <p class="lead">The page you opened does not exist in Smart Recycle. Return home or login again to continue.</p>
      <div class="row">
        <button class="btn btn-success primary-btn" data-page="home">Home</button>
        <button class="btn btn-outline-success ghost-btn" data-auth="login">Login</button>
      </div>
    </div>
  </section>
`;
