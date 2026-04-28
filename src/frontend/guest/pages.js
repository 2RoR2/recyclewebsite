import { state, wasteGuide } from "../../backend/database.js";
import { renderBins, renderContact, renderEducation, renderRewards, escapeHtml, sectionTitle } from "../shared/templates.js";

const renderHome = () => `
  <section class="hero container-fluid platform-hero">
    <img class="hero-img" src="/images/recycle-hero.png" alt="Smart recycling bins">
    <div class="hero-copy">
      <p class="eyebrow">Smart Recycle</p>
      <h1>Recycle smarter. Earn cleaner rewards.</h1>
      <p class="lead">A working campus recycling platform where users scan smart bins, learn sorting, collect points, and redeem sustainable items.</p>
      <div class="hero-actions">
        <button class="btn btn-success primary-btn" data-auth="register">Create Account</button>
        <button class="btn btn-outline-success ghost-btn" data-page="preview-rewards">View Rewards</button>
        <button class="btn btn-light text-btn hero-login" data-auth="login">Login</button>
      </div>
      <div class="trust-row">
        <span>QR verified disposal</span>
        <span>Protect the environment</span>
        <span>Eco-friendly</span>
      </div>
    </div>
  </section>
  <section class="content-band">
    <div class="section-title mb-4">
      <p class="eyebrow">How it works</p>
      <h1>Recycle smarter. Earn cleaner rewards.</h1>
      <p class="lead">Each QR code belongs to a smart bin. Scan, select what have been thrown, and the system checks the bin type before issuing points.</p>
    </div>
    <div class="process-grid">
      ${[
        ["01", "Scan the bin", "Every bin has its own QR link and accepted waste type."],
        ["02", "Choose waste", "Select what you threw after the QR identifies the bin."],
        ["03", "Get verified", "The system compares bin type with selected waste."],
        ["04", "Redeem items", "Collect enough points and request rewards for pickup."],
      ].map(([number, title, text]) => `
        <article class="card h-100 shadow-sm process-card">
          <span>${number}</span>
          <h2>${title}</h2>
          <p>${text}</p>
        </article>
      `).join("")}
    </div>
  </section>
  <section class="content-band split-band">
    <img class="split-img shadow" src="/images/recycle-flow.png" alt="Phone scanning a recycling QR code">
    <div>
      <p class="eyebrow">Education first</p>
      <h1>A cleaner way to improve your recycling habits.</h1>
      <p class="lead">Quiz questions, sorting game, QR records, leaderboards, and redemption pickup make recycling a more engaging and educational experience.</p>
      <button class="btn btn-success primary-btn" data-page="education">Open Waste Guide</button>
    </div>
  </section>
`;

const renderAuth = () => {
  const isLogin = state.authMode === "login";

  return `
    <section class="page auth-wrap">
      <div class="panel auth-card card shadow-lg border-0">
        <p class="eyebrow">${isLogin ? "Welcome back" : "Create account"}</p>
        <h1>${isLogin ? "Login" : "Sign Up"}</h1>
        <p class="lead">${isLogin ? "Use email and password. Demo accounts are shown below." : "New accounts are created as normal users."}</p>
        <form class="form" data-form="${isLogin ? "login" : "register"}">
          ${isLogin ? "" : `<label>Name<input name="name" value="${escapeHtml(state.form.name)}"></label>`}
          <label>Email<input name="email" type="email" value="${escapeHtml(state.form.email)}"></label>
          <label>Password<input name="password" type="password" value="${escapeHtml(state.form.password)}"></label>
          <button class="btn btn-success primary-btn" type="submit">${isLogin ? "Login" : "Sign Up"}</button>
        </form>
        <div class="demo-row">
          <button class="btn btn-outline-success ghost-btn" data-demo="user">Fill User Demo</button>
          <button class="btn btn-outline-success ghost-btn" data-demo="admin">Fill Admin Demo</button>
        </div>
        <button class="btn btn-light text-btn" data-auth="${isLogin ? "register" : "login"}">${isLogin ? "Need an account? Sign up" : "Already have an account? Login"}</button>
      </div>
    </section>
  `;
};

const renderAbout = () => `
  <section class="page grid-2">
    <img class="split-img shadow" src="/images/recycle-flow.png" alt="QR recycling points flow">
    <div>
      ${sectionTitle("About The System", "The project solves irresponsible rubbish disposal by connecting smart bins, QR records, points, penalties, and rewards in one web system.")}
      <ul class="lead">
        <li>Sustainability purpose: encourage proper recycling habits.</li>
        <li>Innovation: QR code on each smart bin records bin location and user action.</li>
        <li>Reward idea: every valid rubbish disposal gives one point.</li>
      </ul>
    </div>
  </section>
`;

export const renderGuestPage = () => {
  if (state.page === "auth") return renderAuth();
  if (state.page === "education") return renderEducation(wasteGuide);
  if (state.page === "about") return renderAbout();
  if (state.page === "public-bins") return renderBins({ guest: true });
  if (state.page === "preview-rewards") return renderRewards({ preview: true });
  if (state.page === "contact") return renderContact();
  return renderHome();
};
