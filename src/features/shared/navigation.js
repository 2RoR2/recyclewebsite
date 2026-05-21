import { currentUser, role } from "../../backend/services.js";
import { state } from "../../backend/database.js";
import { escapeHtml } from "./templates.js";

const adminNavGroups = [
  { label: "Bins", items: [["manage-qr", "Manage QR Code"], ["manage-bins", "Manage Bins"], ["bin-status", "Bin Status"]] },
  { label: "Rewards", items: [["manage-rewards", "Manage Items"], ["redemptions", "Redemption Requests"]] },
  { label: "User", items: [["manage-users", "Manage Users"]] },
];

const navForRole = () => {
  if (role() === "guest") {
    return [
      ["home", "Home"],
      ["recycle-guide", "Recycle Guide"],
      ["news", "News"],
      ["support", "Support"],

    ];
  }

  if (role() === "user") {
    return [
      ["locations", "Location"],
      ["maps", "Maps"],
      ["scan", "Scan"],
      ["education", "Learn"],
      ["game", "Game"],
      ["rewards", "Redeem"],
    ];
  }

  return [];
};

const adminDesktopNav = () => `
  <button class="${state.page === "admin-dashboard" ? "active" : ""}" data-page="admin-dashboard">Dashboard</button>
  ${adminNavGroups
    .map(
      (group) => group.items.length === 1
        ? `<button class="${state.page === group.items[0][0] ? "active" : ""}" data-page="${group.items[0][0]}">${group.items[0][1]}</button>`
        : `
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

const collapsedMenu = (items, dashboard = false, anchorMode = false) => `
  <div class="dropdown main-menu">
    <button class="dropdown-toggle nav-menu-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Open navigation menu">
      <span aria-hidden="true">Menu</span>
    </button>
    <ul class="dropdown-menu dropdown-menu-dark">
      ${dashboard ? `<li><button class="dropdown-item ${state.page === "admin-dashboard" ? "active" : ""}" data-page="admin-dashboard">Dashboard</button></li>` : ""}
      ${items.map(([page, label], index) => `<li><button class="dropdown-item ${anchorMode && index === 0 ? "active" : state.page === page ? "active" : ""}" ${anchorMode ? `data-anchor="${page}"` : `data-page="${page}"`}>${label}</button></li>`).join("")}
    </ul>
  </div>
`;

export const renderNav = (navLinks, navActions) => {
  const user = currentUser();
  navLinks.classList.toggle("has-dropdowns", role() === "admin");
  navActions.classList.toggle("guest-auth-actions", !user);

  if (role() === "admin") {
    navLinks.innerHTML = `
      <div class="desktop-nav">${adminDesktopNav()}</div>
      <div class="mobile-nav">${collapsedMenu(adminNavGroups.flatMap((group) => group.items), true)}</div>
    `;
  } else {
    const items = navForRole();
    navLinks.innerHTML = user
      ? `
        <div class="desktop-nav">${items.map(([page, label]) => `<button class="${state.page === page ? "active" : ""}" data-page="${page}">${label}</button>`).join("")}</div>
        <div class="mobile-nav">${collapsedMenu(items)}</div>
      `
      : `
        <div class="desktop-nav guest-desktop-nav">${items.map(([page, label]) => `<button class="${state.page === page ? "active" : ""}" data-page="${page}">${label}</button>`).join("")}</div>
        <div class="mobile-nav">${collapsedMenu(items)}</div>
      `;
  }

  const installButton = `
    <button class="install-nav-btn" data-action="install-pwa" type="button" aria-label="Install EcoCycle app" title="Install EcoCycle app">
      <span aria-hidden="true">+</span>
      <span>Install</span>
    </button>
  `;

  navActions.innerHTML = user
    ? `
      ${installButton}
      <div class="dropdown account-menu">
        <button class="account-chip ${["profile", "history", "points", "learning-records", "my-redeemed", "collection"].includes(state.page) ? "active" : ""}" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Open account menu">
          ${user.avatar ? `<img src="${escapeHtml(user.avatar)}" alt="">` : `<span class="avatar-fallback">${escapeHtml(user.name.slice(0, 1))}</span>`}
          <span class="account-name">${escapeHtml(user.name)}</span>
        </button>
        <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end">
          ${
            user.role === "user"
              ? `
                <li><button class="dropdown-item ${state.page === "history" ? "active" : ""}" data-page="history">History</button></li>
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
    : `
      <button class="btn btn-success btn-sm nav-btn join-now-btn" data-auth="register" type="button">Join Now <span aria-hidden="true">+</span></button>
      ${installButton}
    `;
};
