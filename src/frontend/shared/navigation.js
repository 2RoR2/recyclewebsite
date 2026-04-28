import { currentUser, role } from "../../backend/services.js";
import { state } from "../../backend/database.js";
import { escapeHtml } from "./templates.js";

const adminNavGroups = [
  { label: "Bins", items: [["manage-qr", "Manage QR Code"], ["manage-bins", "Manage Bins"], ["bin-status", "Bin Status"]] },
  { label: "Records", items: [["waste-records", "Waste Records"], ["points-management", "Points Management"], ["penalty-management", "Penalty Management"], ["reports", "Reports"]] },
  { label: "Rewards", items: [["manage-rewards", "Manage Items"], ["redemptions", "Redemption Requests"]] },
  { label: "People", items: [["manage-users", "Manage Users"], ["feedback-admin", "Feedback"]] },
  { label: "System", items: [["manage-quiz", "Manage Quiz"], ["announcement", "Announcement"]] },
];

const navForRole = () => {
  if (role() === "user") {
    return [
      ["scan", "Scan QR"],
      ["education", "Learn"],
      ["quiz", "Quiz"],
      ["game", "Game"],
      ["rewards", "Redeem"],
      ["leaderboard", "Leaderboard"],
      ["locations", "Bins"],
      ["contact", "Feedback"],
    ];
  }

  return [
    ["home", "Home"],
    ["education", "Learn"],
    ["about", "About"],
    ["public-bins", "Bins"],
    ["preview-rewards", "Rewards"],
    ["contact", "Contact"],
  ];
};

export const renderNav = (navLinks, navActions) => {
  if (role() === "admin") {
    navLinks.innerHTML = `
      <button class="${state.page === "admin-dashboard" ? "active" : ""}" data-page="admin-dashboard">Dashboard</button>
      ${adminNavGroups
        .map(
          (group) => `
          <div class="dropdown">
            <button class="dropdown-toggle ${group.items.some(([page]) => page === state.page) ? "active" : ""}" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              ${group.label}
            </button>
            <ul class="dropdown-menu dropdown-menu-dark">
              ${group.items
                .map(([page, label]) => `<li><button class="dropdown-item ${state.page === page ? "active" : ""}" data-page="${page}">${label}</button></li>`)
                .join("")}
            </ul>
          </div>
        `
        )
        .join("")}
    `;
  } else {
    navLinks.innerHTML = navForRole()
      .map(([page, label]) => `<button class="${state.page === page ? "active" : ""}" data-page="${page}">${label}</button>`)
      .join("");
  }

  const user = currentUser();
  navActions.innerHTML = user
    ? `
      <div class="dropdown account-menu">
        <button class="account-chip ${["profile", "history", "points", "penalties", "learning-records", "my-redeemed", "collection"].includes(state.page) ? "active" : ""}" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Open account menu">
          ${user.avatar ? `<img src="${escapeHtml(user.avatar)}" alt="">` : `<span class="avatar-fallback">${escapeHtml(user.name.slice(0, 1))}</span>`}
          <span class="account-name">${escapeHtml(user.name)}</span>
        </button>
        <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end">
          ${
            user.role === "user"
              ? `
                <li><button class="dropdown-item ${state.page === "history" ? "active" : ""}" data-page="history">History</button></li>
                <li><button class="dropdown-item ${state.page === "points" ? "active" : ""}" data-page="points">Points Record</button></li>
                <li><button class="dropdown-item ${state.page === "penalties" ? "active" : ""}" data-page="penalties">Penalty Record</button></li>
                <li><button class="dropdown-item ${state.page === "learning-records" ? "active" : ""}" data-page="learning-records">Learning Records</button></li>
                <li><button class="dropdown-item ${state.page === "my-redeemed" ? "active" : ""}" data-page="my-redeemed">My Redeemed Items</button></li>
                <li><button class="dropdown-item ${state.page === "collection" ? "active" : ""}" data-page="collection">Collection Code</button></li>
              `
              : `<li><button class="dropdown-item ${state.page === "reports" ? "active" : ""}" data-page="reports">Reports</button></li>`
          }
          <li><button class="dropdown-item ${state.page === "profile" ? "active" : ""}" data-page="profile">Profile Settings</button></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item" data-action="logout">Logout</button></li>
        </ul>
      </div>
    `
    : `<button class="btn btn-outline-light btn-sm nav-btn ghost-btn" data-auth="register">Sign Up</button><button class="btn btn-success btn-sm nav-btn" data-auth="login">Login</button>`;
};
