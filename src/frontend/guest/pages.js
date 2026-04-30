import { state } from "../../backend/database.js";
import { escapeHtml, sectionTitle } from "../shared/templates.js";

const renderHome = () => `
  <section class="landing-auth store-hero" data-home-hero>
    <div class="hero-image-transition" aria-hidden="true">
      <img src="/images/recycle-people.jpg" alt="">
    </div>
    <div class="landing-overlay">
      <div class="landing-copy">
        <p class="eyebrow">EcoCycle Sarawak</p>
        <h1>Recycle better. Earn meaningful rewards.</h1>
        <p class="lead">A Sarawak recycling platform where locals scan smart bin locations, verify disposal, collect points, and redeem sustainable rewards.</p>
        <div class="trust-row">
          <span>Location QR</span>
          <span>Waste verification</span>
          <span>Reward redemption</span>
        </div>
        <div class="hero-actions">
          <button class="btn btn-success primary-btn" data-auth="register">Start Recycling</button>
          <button class="btn btn-light text-btn hero-login" data-auth="login">Login</button>
        </div>
      </div>
      <div class="landing-showcase">
        <div class="showcase-art">
          <img class="flower-art flower-art-top" src="/images/recycle-flower.png" alt="">
          <img class="showcase-image" src="/images/recycle-tree.png" alt="EcoCycle message visual">
        </div>
      </div>
    </div>
  </section>
  <section class="store-shelf" data-store-shelf>
    <div class="store-headline">
      <h2>EcoCycle in one view.</h2>
      <p>Scan, learn, redeem, and locate bins quickly.</p>
    </div>
    <div class="store-card-row">
      ${[
        ["Scan", "Scan one QR to start disposal.", "recycle-hero.png"],
        ["Learn", "Practice sorting before real use.", "recycle-flow.png"],
        ["Redeem", "Use points for useful rewards.", "recycle-rewards.png"],
        ["Locate", "Find active bins across Sarawak.", "recycle-locate.jpg"],
      ].map(([title, text, image]) => `
        <article class="store-card">
          <img src="/images/${image}" alt="">
          <div>
            <span>${title}</span>
            <p>${text}</p>
          </div>
        </article>
      `).join("")}
    </div>
  </section>
  <section class="content-band landing-band">
    ${sectionTitle("How EcoCycle Works", "Each recycling location has its own QR code. Scan the code, allow location check, and then show your item so the system can confirm you are using the right bin at the right place.")}
    <div class="process-grid">
      ${[
        ["01", "Scan location QR", "One QR code identifies the recycling location."],
        ["02", "Show your item clearly", "After the short countdown, hold your item in view so it can be checked."],
        ["03", "Get confirmation", "The system verifies your location and matches your item with the selected bin category."],
        ["04", "Redeem rewards", "Keep recycling to collect points, then use them to redeem available items."],
      ].map(([number, title, text]) => `
        <article class="card h-100 shadow-sm process-card">
          <span>${number}</span>
          <h2>${title}</h2>
          <p>${text}</p>
        </article>
      `).join("")}
    </div>
  </section>
`;

const renderAuth = ({ embedded = false } = {}) => {
  const isLogin = state.authMode === "login";

  return `
    <section class="${embedded ? "auth-embedded" : "page auth-wrap"}">
      <div class="${embedded ? "" : "panel auth-card card shadow-lg border-0"}">
        <p class="eyebrow">${isLogin ? "Welcome back" : "Create account"}</p>
        <h1>${isLogin ? "Login" : "Sign Up"}</h1>
        <p class="lead">${isLogin ? "Continue scanning bins and redeeming rewards." : "Create an account for scan history, points, rewards, and learning records."}</p>
        <form class="form" data-form="${isLogin ? "login" : "register"}">
          ${isLogin ? "" : `
            <label>Username
              <input name="name" autocomplete="name" minlength="2" placeholder="Example: Aina" value="${escapeHtml(state.form.name)}">
              <small>This name appears in your recycling records, leaderboard, feedback, and redemption requests.</small>
            </label>
          `}
          <label>Email
            <input name="email" type="email" autocomplete="email" placeholder="you@example.com" value="${escapeHtml(state.form.email)}">
            <small>Use this email to login and recover your EcoCycle account later.</small>
          </label>
          <label>Password
            <input name="password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" ${isLogin ? "" : "minlength=\"8\" pattern=\"(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}\""} placeholder="${isLogin ? "Enter your password" : "At least 8 characters"}" value="${escapeHtml(state.form.password)}">
            <small>${isLogin ? "Enter the password you used when creating your account." : "Use uppercase, lowercase, number, and symbol. Example: EcoCycle@2026"}</small>
          </label>
          <button class="btn btn-success primary-btn" type="submit">${isLogin ? "Login" : "Sign Up"}</button>
        </form>
        <div class="demo-row">
          <button class="btn btn-outline-success ghost-btn" data-demo="user">Fill User Demo</button>
          <button class="btn btn-outline-success ghost-btn" data-demo="admin">Fill Admin Demo</button>
        </div>
        ${embedded ? "" : `<button class="btn btn-light text-btn" data-auth="${isLogin ? "register" : "login"}">${isLogin ? "Need an account? Sign up" : "Already have an account? Login"}</button>`}
      </div>
    </section>
  `;
};

export const renderGuestPage = () => {
  if (state.page === "auth") return renderAuth();
  return renderHome();
};
