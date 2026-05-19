import { collectionLocation, gameItems, state, wasteGuide } from "../../backend/database.js";
import { currentUser, selectedBin, selectedReward, userLearningRecords, userRecords, userRedeemed } from "../../backend/services.js";
import { escapeHtml, recordsTable, renderContact, renderEducation, renderLocationPage, renderMapPage, renderScanPage, renderRewards, sectionTitle, stat } from "../shared/templates.js";

const redeemedCard = (item) => `
  <article class="card h-100 shadow-sm">
    <h2>${escapeHtml(item.item)}</h2>
    <p>${escapeHtml(item.date)}</p>
    <span class="badge">${escapeHtml(item.status)}</span>
    <div class="qr-box">${escapeHtml(item.code)}</div>
  </article>
`;

const renderSelectWaste = () => `
  ${(() => {
    const activeZone = state.sensorCheck?.manualZone || "";
    const zoneClass = (zone) => activeZone === zone ? "active" : "";
    return `
  <section class="page">
    ${sectionTitle("Smart Bin Active", "Confirm location and prepare waste detection.")}
    <div class="scanned-bin-hero panel card shadow-sm">
      <p class="eyebrow">Scanned Bin</p>
      <h1>${escapeHtml(selectedBin().name)}</h1>
      <div class="mini-row">
        <span>${escapeHtml(selectedBin().location)}</span>
        <span>Bin type: <b data-active-zone-label>${escapeHtml(activeZone || selectedBin().accepts)}</b></span>
      </div>
    </div>
    <div class="panel card shadow-sm ai-scan-card">
      <div>
        <p class="eyebrow">${state.locationCheck?.verified ? "Ready" : "GPS Required"}</p>
        <h2>${state.locationCheck?.verified ? "Ready for camera detection" : "Verify GPS to continue"}</h2>
        ${state.aiDetection ? `<p class="lead">${escapeHtml(state.aiDetection.label)} - ${state.aiDetection.confidence}% confidence (${escapeHtml(state.sensorCheck?.zone || "Unknown zone")})</p>` : ""}
      </div>
      ${state.locationCheck?.verified ? `
        <div class="ai-zone-wrapper ${activeZone ? "has-selected-zone" : ""}">
          <video id="aiSensorFeed" class="ai-sensor-preview" autoplay muted playsinline></video>
          <div class="ai-zone-grid">
            <button type="button" class="ai-zone ${zoneClass("Paper")}" data-zone-select="Paper"><span>Paper Bin Zone</span></button>
            <button type="button" class="ai-zone ${zoneClass("Plastic")}" data-zone-select="Plastic"><span>Plastic Bin Zone</span></button>
            <button type="button" class="ai-zone ${zoneClass("Aluminium")}" data-zone-select="Aluminium"><span>Aluminium Bin Zone</span></button>
            <button type="button" class="ai-zone ${zoneClass("General Waste")}" data-zone-select="General Waste"><span>General Waste Bin Zone</span></button>
          </div>
        </div>
        <button class="btn btn-success primary-btn" data-action="start-detection">Start Detection</button>
      ` : `<button class="btn btn-success primary-btn" data-action="verify-location">Verify GPS & Start Detection</button>`}
    </div>
  </section>
`;
  })()}
`;

const renderItemDetail = () => {
  const reward = selectedReward();
  const user = currentUser();
  if (!reward) return renderRewards({ user });

  return `
    <section class="page auth-wrap">
      <div class="panel auth-card card shadow-lg border-0">
        <p class="eyebrow">Item Detail</p>
        <h1>${escapeHtml(reward.name)}</h1>
        <p class="lead">${escapeHtml(reward.desc)}</p>
        <div class="grid-3">
          ${stat("Required Points", reward.points)}
          ${stat("Stock", reward.stock)}
          ${stat("Your Points", user.points)}
        </div>
        <button class="btn btn-success primary-btn" data-page="redeem-confirm">Continue</button>
      </div>
    </section>
  `;
};

const renderRedeemConfirm = () => {
  const reward = selectedReward();
  if (!reward) return renderRewards({ user: currentUser() });

  return `
    <section class="page auth-wrap">
      <div class="panel auth-card card shadow-lg border-0">
        <p class="eyebrow">Redeem Confirmation</p>
        <h1>Confirm ${escapeHtml(reward.name)}</h1>
        <p class="lead">Admin must approve the request before collection. Bring the collection code to the counter.</p>
        <button class="btn btn-success primary-btn" data-confirm-redeem="${reward.id}">Confirm Redemption</button>
      </div>
    </section>
  `;
};

const renderRedeemed = () => `
  <section class="page">
    ${sectionTitle("My Redeemed Items", "View item collection status and pickup code.")}
    <div class="grid-3">
      ${userRedeemed().length === 0 ? "<p>No redeemed items yet.</p>" : userRedeemed().map((item) => redeemedCard(item)).join("")}
    </div>
  </section>
`;

const renderCollection = () => {
  const items = userRedeemed();
  const filterText = String(state.collectionFilterText || "").trim().toLowerCase();
  const filterStatus = state.collectionFilterStatus || "All";
  const formatDate = (timestamp) => {
    if (!timestamp || Number.isNaN(Number(timestamp))) return "Not available";
    return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(timestamp)));
  };
  const expiryForItem = (item) => {
    const redeemedAt = item.redeemedAtMs || (typeof item.id === "number" ? item.id : null);
    const expiresAt = item.expiresAtMs || (redeemedAt ? redeemedAt + (1000 * 60 * 60 * 24 * 30) : null);
    return expiresAt;
  };
  const filteredItems = items.filter((item) => {
    const statusLabel = item.status === "Collected" ? "Already Redeemed" : item.status;
    const textMatch = !filterText
      || item.item.toLowerCase().includes(filterText)
      || item.code.toLowerCase().includes(filterText)
      || statusLabel.toLowerCase().includes(filterText);
    const statusMatch = filterStatus === "All" || item.status === filterStatus;
    return textMatch && statusMatch;
  });

  return `
    <section class="page">
      ${sectionTitle("Collection Page", "Show your pickup code and follow the map to the EcoCycle Sarawak collection counter.")}
      <div class="collection-layout">
        <div class="panel auth-card card shadow-lg border-0">
          <p class="eyebrow">Pickup Codes</p>
          <h1>${items.length ? "Your Collection List" : "No collection yet"}</h1>
          ${items.length ? `
            <div class="inline-form">
              <input type="search" data-collection-filter-text placeholder="Search item, code, or status" value="${escapeHtml(state.collectionFilterText)}">
              <select data-collection-filter-status>
                ${["All", "Pending", "Approved", "Rejected", "Collected"].map((status) => `<option ${state.collectionFilterStatus === status ? "selected" : ""}>${status}</option>`).join("")}
              </select>
            </div>
          ` : ""}
          ${items.length === 0 ? `
            <div class="qr-box large">COL-00000</div>
            <p class="lead">Redeem an item first to receive a pickup code.</p>
          ` : `
            <div class="grid-2">
              ${filteredItems.map((item) => {
                const expiresAt = expiryForItem(item);
                const isExpired = expiresAt ? Date.now() > expiresAt : false;
                const statusLabel = item.status === "Collected" ? "Already Redeemed" : item.status;
                return `
                  <article class="card h-100 shadow-sm">
                    <p class="eyebrow">${escapeHtml(item.item)}</p>
                    <div class="qr-box">${escapeHtml(item.code)}</div>
                    <div class="mini-row">
                      <span>Status: ${escapeHtml(statusLabel)}</span>
                      <span>${isExpired ? "Expired" : "Valid"}</span>
                    </div>
                    <p><strong>Expired Date:</strong> ${escapeHtml(formatDate(expiresAt))}</p>
                  </article>
                `;
              }).join("")}
            </div>
            ${filteredItems.length === 0 ? `<p class="lead">No collection code matched your filters.</p>` : ""}
            <p class="lead">Show an active code to the admin counter to collect your approved item.</p>
          `}
          <div class="mini-row">
            <span>${escapeHtml(collectionLocation.name)}</span>
            <span>${escapeHtml(collectionLocation.place)}</span>
          </div>
        </div>
        <div class="panel card shadow-sm collection-map-card">
          <div>
            <p class="eyebrow">Collection Location</p>
            <h2>${escapeHtml(collectionLocation.name)}</h2>
            <p>${escapeHtml(collectionLocation.address)}</p>
          </div>
          <div id="collectionMap" class="collection-map"></div>
          <a class="btn btn-success primary-btn map-link" href="https://www.google.com/maps/dir/?api=1&destination=${collectionLocation.lat},${collectionLocation.lng}" target="_blank" rel="noreferrer">Open Directions</a>
        </div>
      </div>
    </section>
  `;
};

const renderLeaderboard = () => `
  <section class="page">
    ${sectionTitle("Leaderboard", "Weekly and monthly ranking based on recycling points.")}
    <div class="leaderboard">
      ${state.users
        .filter((user) => user.role === "user")
        .sort((a, b) => b.points - a.points)
        .map((user, index) => `
          <div class="card shadow-sm"><strong>#${index + 1}</strong><span>${escapeHtml(user.name)}</span><b>${user.points} pts</b></div>
        `)
        .join("")}
    </div>
  </section>
`;

const renderGame = () => {
  const gamePayload = JSON.stringify(gameItems).replaceAll("&", "&amp;").replaceAll("'", "&#039;");

  return `
  <section class="page">
    ${sectionTitle("Sorting Game", "Practice sorting rubbish into the correct virtual bin. The game is for learning only and does not give points.")}
    <div class="three-game-shell panel shadow-sm">
      <div class="three-game-top">
        <div>
          <p class="eyebrow">Virtual Bins</p>
          <h2>Drag item to bin</h2>
        </div>
        <div class="mini-row">
          <span>Paper</span>
          <span>Plastic</span>
          <span>Aluminium</span>
          <span>General Waste</span>
        </div>
      </div>
      <div id="threeGame" class="three-game" data-items='${gamePayload}'></div>
      <p class="lead game-hint">Tip: practise here first so you choose the correct bin during real scans.</p>
    </div>
  </section>
`;
};

const renderLearningRecords = () => `
  <section class="page">
    ${sectionTitle("Learning Records", "Sorting game attempts are recorded here for learning review.")}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Type</th><th>Item</th><th>Score</th><th>Points</th><th>Date</th></tr></thead>
        <tbody>
          ${userLearningRecords().length === 0 ? `<tr><td colspan="5">No learning records yet.</td></tr>` : userLearningRecords().map((record) => `
            <tr>
              <td>${escapeHtml(record.type)}</td>
              <td>${escapeHtml(record.item || "-")}</td>
              <td>${record.score}/${record.total}</td>
              <td>${record.points}</td>
              <td>${escapeHtml(record.date)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  </section>
`;

const renderHistoryAll = () => {
  const filterText = String(state.historyFilterText || "").trim().toLowerCase();
  const filterType = state.historyFilterType || "All";
  const combined = [
    ...userRecords().map((record) => ({
      id: record.id,
      type: "Recycling Record",
      detail: `${record.waste} (${record.bin})`,
      result: record.status,
      points: record.points,
      date: record.date,
    })),
    ...userLearningRecords().map((record) => ({
      id: record.id,
      type: "Learning Record",
      detail: `${record.item || "Sorting Game"} (${record.answer || "-"})`,
      result: `${record.score}/${record.total}`,
      points: record.points,
      date: record.date,
    })),
  ].sort((a, b) => (b.id || 0) - (a.id || 0));
  const filtered = combined.filter((item) => {
    const typeMatch = filterType === "All" || item.type === filterType;
    const textMatch = !filterText
      || item.type.toLowerCase().includes(filterText)
      || item.detail.toLowerCase().includes(filterText)
      || item.result.toLowerCase().includes(filterText)
      || item.date.toLowerCase().includes(filterText);
    return typeMatch && textMatch;
  });

  return `
    <section class="page">
      ${sectionTitle("History", "All recycling and learning records in one place.")}
      <div class="inline-form">
        <input type="search" data-history-filter-text placeholder="Search detail, result, date..." value="${escapeHtml(state.historyFilterText)}">
        <select data-history-filter-type>
          ${["All", "Recycling Record", "Learning Record"].map((type) => `<option ${state.historyFilterType === type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Detail</th><th>Result</th><th>Points</th><th>Date</th></tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="5">No history matched your filters.</td></tr>` : filtered.map((item) => `
              <tr>
                <td>${escapeHtml(item.type)}</td>
                <td>${escapeHtml(item.detail)}</td>
                <td>${escapeHtml(item.result)}</td>
                <td>${item.points}</td>
                <td>${escapeHtml(item.date)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
};

const renderProfile = () => {
  const user = currentUser();
  const avatar = user.avatar
    ? `<img class="profile-avatar-img" src="${escapeHtml(user.avatar)}" alt="">`
    : `<span class="profile-avatar-fallback">${escapeHtml(user.name.slice(0, 1))}</span>`;

  const recordsCount = userRecords().length;
  const redemptionsCount = userRedeemed().length;
  const scoreTotal = userLearningRecords().reduce((acc, r) => acc + (r.score || 0), 0);
  const roleLabel = user.role === "admin" ? "System Administrator" : "Eco Member";
  const locationLabel = user.role === "admin" ? "Office / Counter" : "Home Area";

  return `
    <section class="page profile-settings-page">
      <div class="profile-settings-shell">
        <section class="profile-settings-hero panel shadow-sm">
          <div class="profile-settings-identity">
            <div class="profile-avatar profile-settings-avatar">${avatar}</div>
            <div class="profile-settings-title">
              <p class="eyebrow">${roleLabel}</p>
              <h1>Profile Settings</h1>
              <p class="lead">${escapeHtml(user.email)}</p>
            </div>
          </div>
          <div class="profile-settings-stats">
            ${stat("Points", user.points)}
            ${stat("Scans", recordsCount)}
            ${stat("Score", scoreTotal)}
            ${stat("Redeemed", redemptionsCount)}
          </div>
        </section>

        <div class="profile-settings-layout">
          <aside class="profile-account-card panel shadow-sm">
            <p class="eyebrow">Account Overview</p>
            <h2>${escapeHtml(user.name)}</h2>
            <dl class="profile-read-list">
              <div><dt>Email</dt><dd>${escapeHtml(user.email)}</dd></div>
              <div><dt>${locationLabel}</dt><dd>${escapeHtml(user.location || "Not set")}</dd></div>
              <div><dt>Privacy</dt><dd>${escapeHtml(user.privacy || "Public ranking")}</dd></div>
              <div><dt>Level</dt><dd>${Math.floor(user.points / 100) + 1}</dd></div>
            </dl>
          </aside>

          <section class="profile-form-panel panel shadow-sm">
            <div class="profile-settings-section-head">
              <div>
                <p class="eyebrow">Edit Details</p>
                <h2>Personal information</h2>
              </div>
            </div>
            <form class="form" data-form="profile">
              <div class="profile-form-grid">
                <label class="profile-field profile-upload-field full">
                  Profile image
                  <input name="avatar" type="file" accept="image/*">
                </label>
                <label class="profile-field">Full name<input name="name" value="${escapeHtml(user.name)}"></label>
                <label class="profile-field">Email<input name="email" type="email" value="${escapeHtml(user.email)}"></label>
                <label class="profile-field">Phone<input name="phone" value="${escapeHtml(user.phone)}" placeholder="Optional phone number"></label>
                <label class="profile-field">${locationLabel}<input name="location" value="${escapeHtml(user.location)}"></label>
                <label class="profile-field full">New password<input name="password" type="password" placeholder="Leave blank to keep current password"></label>
              </div>
              <button class="btn btn-success primary-btn profile-save-btn" type="submit">Save Changes</button>
            </form>
          </section>

          ${user.role === "admin" ? "" : `
            <section class="profile-danger-panel panel shadow-sm">
              <div>
                <p class="eyebrow">Danger Zone</p>
                <h2>Delete account</h2>
                <p>This will remove your profile and related records from this app.</p>
              </div>
              <button class="btn btn-danger danger-btn" data-action="delete-profile">Delete Account</button>
            </section>
          `}
        </div>
      </div>
    </section>
  `;
};

export const renderUserPage = () => {
  const user = currentUser();

  if (state.page === "locations") return renderLocationPage();
  if (state.page === "maps") return renderMapPage();
  if (state.page === "scan") return renderScanPage();
  if (state.page === "education") return renderEducation(wasteGuide);
  if (state.page === "game") return renderGame();
  if (state.page === "learning-records") return renderLearningRecords();
  if (state.page === "select-waste") return renderSelectWaste();
  if (state.page === "points") return recordsTable("Points Record", userRecords().filter((record) => record.points > 0));
  if (state.page === "rewards") return renderRewards({ user });
  if (state.page === "item-detail") return renderItemDetail();
  if (state.page === "redeem-confirm") return renderRedeemConfirm();
  if (state.page === "my-redeemed") return renderRedeemed();
  if (state.page === "collection") return renderCollection();
  if (state.page === "history") return renderHistoryAll();
  if (state.page === "leaderboard") return renderLeaderboard();
  if (state.page === "contact") return renderContact();
  if (state.page === "profile") return renderProfile();
  return renderLocationPage();
};
