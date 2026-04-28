import { collectionLocation, gameItems, state, wasteGuide, wasteTypes } from "../../backend/database.js";
import { currentUser, selectedBin, selectedReward, userLearningRecords, userRecords, userRedeemed } from "../../backend/services.js";
import { escapeHtml, recordsTable, renderBins, renderContact, renderEducation, renderRewards, sectionTitle, stat } from "../shared/templates.js";

const redeemedCard = (item) => `
  <article class="card h-100 shadow-sm">
    <h2>${escapeHtml(item.item)}</h2>
    <p>${escapeHtml(item.date)}</p>
    <span class="badge">${escapeHtml(item.status)}</span>
    <div class="qr-box">${escapeHtml(item.code)}</div>
  </article>
`;

const renderSelectWaste = () => `
  <section class="page">
    ${sectionTitle("Select Waste Type", "Choose what you threw. The system checks it against the scanned bin.")}
    <div class="scanned-bin-hero panel card shadow-sm">
      <p class="eyebrow">Scanned Bin</p>
      <h1>${escapeHtml(selectedBin().name)}</h1>
      <div class="mini-row">
        <span>${escapeHtml(selectedBin().id)}</span>
        <span>Accepts ${escapeHtml(selectedBin().accepts)}</span>
      </div>
    </div>
    <div class="panel card shadow-sm verification-panel">
      <p class="eyebrow">No Sensor Mode</p>
      <h2>System checks bin type against your selected waste</h2>
      <p class="lead">Example: Plastic Bin + Plastic waste = +1 point. Plastic Bin + Paper waste = wrong bin penalty.</p>
    </div>
    <div class="choice-grid">
      ${wasteTypes.map((type) => `<button class="choice ${state.selectedWaste === type ? "active" : ""}" data-waste="${type}">${type}</button>`).join("")}
    </div>
    <div class="row">
      <button class="btn btn-success primary-btn" data-record="check">Record Disposal</button>
    </div>
  </section>
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
  const item = userRedeemed()[0];

  return `
    <section class="page">
      ${sectionTitle("Collection Page", "Show your pickup code and follow the map to the Smart Recycle counter at i-CATS Kuching.")}
      <div class="collection-layout">
        <div class="panel auth-card card shadow-lg border-0">
          <p class="eyebrow">Pickup Code</p>
          <h1>${escapeHtml(item?.item || "No collection yet")}</h1>
          <div class="qr-box large">${escapeHtml(item?.code || "COL-00000")}</div>
          <p class="lead">Show this code to the admin counter to collect your approved item.</p>
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

const shuffled = (items) => [...items].sort(() => Math.random() - 0.5);

const renderQuiz = () => `
  <section class="page">
    ${sectionTitle("Recycle Quiz", "Answer simple questions to practise the difference between recyclable and non-recyclable waste.")}
    <form class="quiz-form" data-form="quiz">
      ${shuffled(state.quizQuestions).map((question, index) => `
        <article class="panel card shadow-sm">
          <p class="eyebrow">Question ${index + 1}</p>
          <h2>${escapeHtml(question.question)}</h2>
          <div class="choice-grid small-choice-grid">
            ${shuffled(question.options).map((option) => `
              <label class="choice option-choice">
                <input type="radio" name="${escapeHtml(question.id)}" value="${escapeHtml(option)}" required>
                <span>${escapeHtml(option)}</span>
              </label>
            `).join("")}
          </div>
        </article>
      `).join("")}
      <button class="btn btn-success primary-btn" type="submit">Submit Quiz</button>
    </form>
  </section>
`;

const renderGame = () => {
  const gamePayload = JSON.stringify(gameItems).replaceAll("&", "&amp;").replaceAll("'", "&#039;");

  return `
  <section class="page">
    ${sectionTitle("3D Sorting Game", "Drag each rubbish item into the correct virtual bin. The system records whether the drop is accurate.")}
    <div class="three-game-shell panel shadow-sm">
      <div class="three-game-top">
        <div>
          <p class="eyebrow">Virtual Bins</p>
          <h2>Drag item to bin</h2>
        </div>
        <div class="mini-row">
          <span>Plastic</span>
          <span>Paper</span>
          <span>General Waste</span>
        </div>
      </div>
      <div id="threeGame" class="three-game" data-items='${gamePayload}'></div>
      <p class="lead game-hint">Tip: drag the floating rubbish item across the scene and release it above a bin.</p>
    </div>
  </section>
`;
};

const renderLearningRecords = () => `
  <section class="page">
    ${sectionTitle("Learning Records", "Quiz and sorting game attempts are recorded here.")}
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

const renderProfile = () => {
  const user = currentUser();
  const avatar = user.avatar
    ? `<img class="profile-avatar-img" src="${escapeHtml(user.avatar)}" alt="">`
    : `<span class="profile-avatar-fallback">${escapeHtml(user.name.slice(0, 1))}</span>`;

  return `
    <section class="page">
      <div class="profile-shell">
        <aside class="profile-card panel card shadow-sm">
          <div class="profile-avatar">${avatar}</div>
          <div>
            <p class="eyebrow">${user.role === "admin" ? "Admin Account" : "User Account"}</p>
            <h1>${escapeHtml(user.name)}</h1>
            <p class="lead">${escapeHtml(user.email)}</p>
          </div>
          <div class="profile-stats">
            ${stat("Role", user.role)}
            ${stat(user.role === "admin" ? "Location" : "Points", user.role === "admin" ? user.location : user.points || 0)}
            ${stat(user.role === "admin" ? "Alerts" : "Penalties", user.role === "admin" ? (user.notifications ? "On" : "Off") : user.penalties || 0)}
          </div>
        </aside>

        <div class="panel auth-card card shadow-lg border-0">
          <p class="eyebrow">Profile Settings</p>
          <h1>Account Details</h1>
          <form class="form" data-form="profile">
            <label>Profile Image<input name="avatar" type="file" accept="image/*"></label>
            <label>Name<input name="name" value="${escapeHtml(user.name)}"></label>
            <label>Email<input name="email" type="email" value="${escapeHtml(user.email)}"></label>
            <label>Phone<input name="phone" value="${escapeHtml(user.phone)}" placeholder="Optional phone number"></label>
            <label>${user.role === "admin" ? "Office / Counter" : "Campus / Area"}<input name="location" value="${escapeHtml(user.location)}"></label>
            <label>Account Visibility
              <select name="privacy">
                ${["Public ranking", "Private activity", "Admin only"].map((option) => `<option ${user.privacy === option ? "selected" : ""}>${option}</option>`).join("")}
              </select>
            </label>
            <label class="check-row"><input name="notifications" type="checkbox" ${user.notifications ? "checked" : ""}> Account notifications</label>
            <label>New Password<input name="password" type="password" placeholder="Leave blank to keep current password"></label>
            <button class="btn btn-success primary-btn" type="submit">Save Profile</button>
          </form>
        </div>
      </div>
    </section>
  `;
};

export const renderUserPage = () => {
  const user = currentUser();

  if (state.page === "scan" || state.page === "locations") return renderBins();
  if (state.page === "education") return renderEducation(wasteGuide);
  if (state.page === "quiz") return renderQuiz();
  if (state.page === "game") return renderGame();
  if (state.page === "learning-records") return renderLearningRecords();
  if (state.page === "select-waste") return renderSelectWaste();
  if (state.page === "points") return recordsTable("Points Record", userRecords().filter((record) => record.points > 0));
  if (state.page === "penalties") return recordsTable("Penalty Record", userRecords().filter((record) => record.points < 0));
  if (state.page === "rewards") return renderRewards({ user });
  if (state.page === "item-detail") return renderItemDetail();
  if (state.page === "redeem-confirm") return renderRedeemConfirm();
  if (state.page === "my-redeemed") return renderRedeemed();
  if (state.page === "collection") return renderCollection();
  if (state.page === "history") return recordsTable("History", userRecords());
  if (state.page === "leaderboard") return renderLeaderboard();
  if (state.page === "contact") return renderContact();
  if (state.page === "profile") return renderProfile();
  return renderBins();
};
