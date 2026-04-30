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
    <p class="eyebrow">EcoCycle Sarawak</p>
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

export const binStations = () =>
  Object.values(
    state.bins.reduce((stations, bin) => {
      const key = bin.station || bin.location;
      if (!stations[key]) {
        const stationCode = bin.qrCode?.split("-")[0] || key.toUpperCase().replaceAll(" ", "-");
        stations[key] = {
          code: stationCode,
          name: key,
          location: bin.location,
          lat: bin.lat,
          lng: bin.lng,
          bins: [],
        };
      }
      stations[key].bins.push(bin);
      return stations;
    }, {})
  ).map((station) => ({
    ...station,
    bins: ["Plastic", "Paper", "General Waste"]
      .map((type) => station.bins.find((bin) => bin.accepts === type))
      .filter(Boolean),
  }));

export const recordsTable = (title, records, embedded = false) => `
  ${(() => {
    const keyword = String(state.globalSearchTerm || "").trim().toLowerCase();
    const filteredRecords = records.filter((record) =>
      !keyword
      || String(record.user || "").toLowerCase().includes(keyword)
      || String(record.waste || "").toLowerCase().includes(keyword)
      || String(record.bin || "").toLowerCase().includes(keyword)
      || String(record.status || "").toLowerCase().includes(keyword)
      || String(record.date || "").toLowerCase().includes(keyword)
    );
    return `
  <section class="${embedded ? "panel" : "page"}">
    ${embedded ? `<h2>${escapeHtml(title)}</h2>` : sectionTitle(title, "Scan records include waste type, points, bin location, and date/time.")}
    <div class="table-wrap">
      <table>
        <thead><tr><th>User</th><th>Waste</th><th>Bin</th><th>Points</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${filteredRecords.length === 0 ? `<tr><td colspan="6">No matching records.</td></tr>` : filteredRecords.map((record) => `
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
  })()}
`;

export const renderEducation = (wasteGuide) => `
  ${(() => {
    const keyword = String(state.globalSearchTerm || "").trim().toLowerCase();
    const filteredGuide = wasteGuide.filter(([type, example, tip]) =>
      !keyword
      || String(type).toLowerCase().includes(keyword)
      || String(example).toLowerCase().includes(keyword)
      || String(tip).toLowerCase().includes(keyword)
    );

    const educationVideos = [
      {
        title: "How Recycling Works",
        embedUrl: "https://www.youtube-nocookie.com/embed/IsAg-JqJnA8",
        description: "Quick overview of how materials move through the recycling process.",
      },
      {
        title: "Waste Sorting Basics",
        embedUrl: "https://www.youtube-nocookie.com/embed/6jQ7y_qQYUA",
        description: "Simple guide to separate recyclable and general waste correctly.",
      },
    ];

    return `
  <section class="page education-page">
    ${sectionTitle("Waste Education Guide", "Each EcoCycle station has Plastic, Paper, and General Waste bins. Learn the category before you scan to avoid penalties.")}
    <div class="education-grid">
      ${filteredGuide
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
    <section class="education-video-shell">
      <div class="section-title mb-0">
        <p class="eyebrow">Video Learning</p>
        <h2>Watch Before You Scan</h2>
        <p class="lead">Short videos to help you sort faster and avoid wrong-bin penalties.</p>
      </div>
      <div class="education-video-grid">
        ${educationVideos
          .map(
            (video) => `
          <article class="card h-100 shadow-sm education-video-card">
            <div class="education-video-frame">
              <iframe
                src="${escapeHtml(video.embedUrl)}"
                title="${escapeHtml(video.title)}"
                loading="lazy"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen>
              </iframe>
            </div>
            <h3>${escapeHtml(video.title)}</h3>
            <p>${escapeHtml(video.description)}</p>
          </article>
        `
          )
          .join("")}
      </div>
    </section>
    <section class="education-video-shell">
      <div class="section-title mb-0">
        <p class="eyebrow">More Resources</p>
        <h2>Learn From Trusted Guides</h2>
        <p class="lead">Extra reading and references for better waste sorting habits.</p>
      </div>
      <div class="education-video-grid">
        ${[
          ["Malaysia Recycling Guide", "https://www.swcorp.gov.my/"],
          ["WWF Recycling Tips", "https://www.wwf.org.uk/thingsyoucando/recycle"],
          ["UNEP Waste Management", "https://www.unep.org/"],
          ["Earth911 Search Tool", "https://search.earth911.com/"],
        ].map(([label, href]) => `
          <article class="card h-100 shadow-sm education-video-card resource-card">
            <h3>${escapeHtml(label)}</h3>
            <p>Open this guide for disposal tips, sorting standards, and recycling best practices.</p>
            <a class="btn btn-outline-success ghost-btn" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Open Resource</a>
          </article>
        `).join("")}
      </div>
    </section>
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
  })()}
`;

export const renderBins = ({ guest = false, admin = false } = {}) => `
  ${(() => {
    const stationDirectionsUrl = (station) =>
      `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
    const filteredStations = binStations();
    return `
  <section class="page">
    ${sectionTitle(guest ? "Public Bin Location" : admin ? "Bin Status" : "Scan QR Page", guest ? "Each location has Plastic, Paper, and General Waste smart bins." : "Scan the QR code at the location. The QR identifies the station before GPS and AI detection.")}
    <div class="${!guest && !admin ? "scan-page-shell" : "map-layout"}">
      <div class="scan-map-panel">
        <div class="leaflet-map panel shadow-sm" id="binMap"></div>
        ${!guest && !admin ? `
          <div class="scan-status-strip">
            <div><strong>6</strong><span>Stations</span></div>
            <div><strong>GPS</strong><span>Auto detect</span></div>
            <div><strong>Live</strong><span>Camera ready</span></div>
            <div><strong>Live</strong><span>Status</span></div>
          </div>
        ` : ""}
      </div>
      <div class="map-list">
        ${!guest && !admin ? `
          <article class="scanner-card h-100 shadow-sm scan-control-card">
            <div class="scanner-copy">
              <p class="eyebrow">Location QR</p>
              <h2>QR Scan Checkpoint</h2>
              <p>Scan the station QR first. Then EcoCycle confirms GPS and starts AI waste detection for the correct bin flow.</p>
            </div>
            <div class="scan-steps" aria-label="QR scan flow">
              <span><b>1</b> Open camera</span>
              <span><b>2</b> Align QR in frame</span>
              <span><b>3</b> Auto verify location</span>
            </div>
            <div class="scanner-visual-row scanner-visual-panel">
              <div class="scanner-action-stack">
                <button class="scanner-launch" id="scannerLaunch" data-action="start-scanner" aria-label="Open camera QR scanner" title="Open camera QR scanner">
                  <span class="scanner-ring" aria-hidden="true"><img src="/images/qrscan.png" alt=""></span>
                  <strong>Start Scan</strong>
                  <small>Camera permission required</small>
                </button>
                <button class="btn btn-outline-success ghost-btn" data-action="set-demo-location">Use My Current Location (Demo)</button>
              </div>
              <div id="qrReader" class="qr-reader hidden"></div>
            </div>
            <div class="scanner-actions hidden" id="scannerActions">
              <button class="icon-btn scanner-icon stop" data-action="stop-scanner" aria-label="Stop QR scanner" title="Stop QR scanner">
                <span aria-hidden="true">x</span>
              </button>
            </div>
          </article>
        ` : ""}
        ${filteredStations.map((station) => `
          <article class="card h-100 shadow-sm station-card scan-station-card">
            <div class="station-card-head">
              <div>
                <p class="eyebrow">Smart Bin Station</p>
                <h2>${escapeHtml(station.name)}</h2>
                <p>${escapeHtml(station.location)}</p>
                <a class="btn btn-outline-success ghost-btn map-link station-map-link" href="${stationDirectionsUrl(station)}" target="_blank" rel="noreferrer">Open Directions</a>
              </div>
              ${admin ? `<canvas class="generated-qr station-card-qr" data-qr-station="${escapeHtml(station.code)}"></canvas>` : ""}
            </div>
            ${admin ? `
              <p class="qr-url" data-qr-url-for-station="${escapeHtml(station.code)}"></p>
            ` : ""}
            <div class="station-bin-set">
              ${station.bins.map((bin) => `
                <div class="station-bin ${bin.accepts.toLowerCase()}">
                  <strong>${escapeHtml(bin.accepts)}</strong>
                  ${admin ? `<span>${escapeHtml(bin.id)}</span>` : ""}
                  <b class="badge ${bin.status.toLowerCase()}">${escapeHtml(bin.status)}</b>
                </div>
              `).join("")}
            </div>
          </article>
        `).join("")}
        ${!guest && !admin && filteredStations.length === 0 ? `
          <article class="card h-100 shadow-sm station-card scan-station-card">
            <p class="eyebrow">No Results</p>
            <h2>No station found.</h2>
            <p class="station-note">No station data is available right now.</p>
          </article>
        ` : ""}
      </div>
    </div>
  </section>
`;
  })()}
`;

const rewardImage = (reward) => {
  if (reward.image) return reward.image;
  const name = reward.name.toLowerCase();
  if (name.includes("rm5")) return "reoladpinRM5.png";
  if (name.includes("rm10")) return "reloadpinRM10.png";
  if (name.includes("rm30")) return "reloadpinRM30.png";
  if (name.includes("electricity")) return "electricalbill.png";
  if (name.includes("water")) return "waterbill.png";
  return "reloadpinRM10.png";
};

export const renderRewards = ({ preview = false, user = null } = {}) => `
  <section class="page">
    ${sectionTitle(preview ? "Rewards Preview" : "Redeem Items", preview ? "Example redeemable items." : `Your points: ${user.points}`)}
    <div class="grid-3">
      ${state.rewards
        .map(
          (reward) => `
          <article class="card h-100 shadow-sm">
            <img src="${rewardImage(reward).startsWith("data:") ? escapeHtml(rewardImage(reward)) : `/images/redeem/${rewardImage(reward)}`}" alt="">
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
      <p class="lead">The page you opened does not exist in EcoCycle Sarawak. Return home or login again to continue.</p>
      <div class="row">
        <button class="btn btn-success primary-btn" data-page="home">Home</button>
        <button class="btn btn-outline-success ghost-btn" data-auth="login">Login</button>
      </div>
    </div>
  </section>
`;

