import { state } from "../../backend/database.js";
import { role } from "../../backend/services.js";

export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const stationDirectionsUrl = (station) =>
  `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;

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

const averageCoordinate = (bins, key, fallback) => {
  const values = bins
    .map((bin) => Number(bin[key]))
    .filter(Number.isFinite);

  if (values.length === 0) return fallback;
  return values.reduce((total, value) => total + value, 0) / values.length;
};

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
  ).map((station) => {
    const bins = ["Paper", "Plastic", "Aluminium", "General Waste"]
      .map((type) => station.bins.find((bin) => bin.accepts === type))
      .filter(Boolean);

    return {
      ...station,
      lat: averageCoordinate(station.bins, "lat", station.lat),
      lng: averageCoordinate(station.bins, "lng", station.lng),
      bins,
    };
  });

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
        description: "Simple guide to separate paper, plastic, aluminium, and general waste correctly.",
      },
    ];

    return `
  <section class="page education-page">
    <section class="learn-concept-hero" aria-label="Waste education introduction">
      <div class="learn-green-card">
        <div class="learn-recycle-badge" aria-hidden="true">♻</div>
        <h1>Acting matters more than only being aware.</h1>
        <p>Learn how to sort waste before scanning. Small correct choices keep reusable materials out of mixed rubbish.</p>
        <span aria-hidden="true"></span>
      </div>
      <div class="learn-photo-board">
        <img class="learn-photo-main" src="/images/user/image2.jpg" alt="Sustainability collage with earth, forest, and recycling symbol">
        <div class="learn-photo-row">
          <img src="/images/resources/resources1.png" alt="Community recycling reference">
          <div class="learn-symbol-tile" aria-hidden="true">♻</div>
        </div>
        <div class="learn-caption-card">
          Give discarded items a cleaner second route.
        </div>
      </div>
      <div class="learn-brand-mark">
        <img src="/images/recycle-logo.png" alt="">
        <strong>EcoCycle</strong>
        <span>Sarawak Sustainability</span>
      </div>
    </section>
    <div class="education-mosaic-grid education-grid">
      ${filteredGuide
        .map(
          ([type, example, tip], index) => `
          <article class="card h-100 shadow-sm education-card mosaic-tile mosaic-waste-tile tile-${index + 1}">
            <span class="pill">${escapeHtml(type)}</span>
            <h2>${escapeHtml(example)}</h2>
            <p>${escapeHtml(tip)}</p>
          </article>
        `
        )
        .join("")}
    </div>
    <section class="education-video-shell education-mosaic-section">
      <div class="mosaic-section-head">
        <p class="eyebrow">Video Learning</p>
        <h2>Watch Before You Scan</h2>
        <p class="lead">Short videos to help you sort faster and choose the right bin.</p>
      </div>
      <div class="education-video-grid education-video-mosaic">
        ${educationVideos
          .map(
            (video, index) => `
          <article class="card h-100 shadow-sm education-video-card mosaic-video-card video-${index + 1}">
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
    <section class="education-video-shell education-mosaic-section">
      <div class="mosaic-section-head">
        <p class="eyebrow">More Resources</p>
        <h2>Learn From Trusted Guides</h2>
        <p class="lead">Extra reading and references for better waste sorting habits.</p>
      </div>
      <div class="education-resource-mosaic education-video-grid">
        ${[
          ["Malaysia Recycling Guide", "https://www.swcorp.gov.my/"],
          ["Council of the Kuching South", "https://mbks.sarawak.gov.my/web/subpage/webpage_view/178"],
          ["Commission of the City of Kuching North", "https://dbku.sarawak.gov.my/page-225-293-318-tid.html"],
          ["World Wildlife Fund", "https://assets.worldwildlife.org/www-prd/documents/8xmq9zvpsz_Reducing_Waste_Guide_1.25.22.pdf"],
          ["Zero Waste Malaysia", "https://trashpedia.zerowastemalaysia.org/en/faq/"],
        ].map(([label, href], index) => `
          <article class="card h-100 shadow-sm education-video-card resource-card mosaic-resource-card resource-${index + 1}">
            <h3>${escapeHtml(label)}</h3>
            <p>Open this guide for disposal tips, sorting standards, and recycling best practices.</p>
            <a class="btn btn-outline-success ghost-btn" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Open Resource</a>
          </article>
        `).join("")}
      </div>
    </section>
    <div class="panel card shadow-sm education-note">
      <img class="education-note-image" src="/images/user/image4.png" alt="" aria-hidden="true">
      <div>
        <p class="eyebrow">Why penalties exist</p>
        <h2>Vandalism of recycling bins is a serious offense</h2>
      </div>
      <blockquote>
        <p class="lead">If a user throws rubbish into the wrong recycling bin, the smart bin alarm system will automatically alert them and guide them to use the correct bin. However, vandalizing public or council recycling bins in Kuching is a serious offense. Offenders may face compounds of up to RM2,000, mandatory community service, or imprisonment of up to 5 years under the Penal Code.</p>
      </blockquote>
      <button class="btn btn-success" data-page="${role() === "user" ? "scan" : "public-bins"}">${role() === "user" ? "Scan a Bin" : "View Bin Locations"}</button>
    </div>
  </section>
`;
  })()}
`;

export const renderLocationPage = () => {
  const stations = binStations();
  const stationAddresses = {
    PEA: "Ground Floor & First Floor, MTLD, Block 11, Lot 11365 & 11366, Jalan Song, Tabuan Heights, 93350 Kuching, Sarawak",
    TAB: "Tabuan Jaya, 93350 Kuching, Sarawak, Malaysia",
    GAL: "100, Jalan Tun Jugah, Tun Jugah, 93350 Kuching, Sarawak, Malaysia",
    SAR: "Saradise, Jalan Saradise, 93350 Kuching, Sarawak, Malaysia",
    BTK: "Emart Batu Kawa, Lot 6369, Block 225 KNLD, 4th Mile, Jalan Batu Kawa, Taman Desa Wira, 93250 Kuching, Sarawak",
    UNI: "Universiti Malaysia Sarawak, 94300 Kota Samarahan, Sarawak, Malaysia",
    UIT: "UiTM Campus Samarahan 2, Jalan Meranek, 94300 Kota Samarahan, Sarawak",
  };
  const midpoint = Math.ceil(stations.length / 2);
  const stationInfoCard = (station, index) => `
    <article class="location-info-card">
      <span>${index + 1}</span>
      <div>
        <h3>${escapeHtml(station.name)}</h3>
        <p>${escapeHtml(station.location)}</p>
        <div class="location-meta-row" aria-label="Station location details">
          <span>${escapeHtml(stationAddresses[station.code] || station.location)}</span>
        </div>
        <a class="location-info-link" href="${stationDirectionsUrl(station)}" target="_blank" rel="noreferrer">Open Directions</a>
      </div>
    </article>
  `;
  return `
  <section class="page location-page">
    ${sectionTitle("Nearby Smart Bins", "Browse nearby EcoCycle stations with bin details and directions.")}
    <section class="location-visual-hero" aria-label="EcoCycle station awareness">
      <div class="location-info-stack">
        ${stations.slice(0, midpoint).map(stationInfoCard).join("")}
      </div>
      <figure class="location-visual-frame">
        <img src="/images/user/image1.png" alt="EcoCycle smart recycling station in a Sarawak park setting">
      </figure>
      <div class="location-info-stack">
        ${stations.slice(midpoint).map((station, index) => stationInfoCard(station, index + midpoint)).join("")}
      </div>
    </section>
  </section>
`;
};

export const renderMapPage = () => {
  const stations = binStations();
  return `
  <section class="page map-page">
    <section class="map-hero-title" aria-label="Smart bin map overview">
      <div>
        <p class="eyebrow">EcoCycle Sarawak</p>
        <h1>Smart Bin Map</h1>
        <p>Interactive map with GPS tracking and live EcoCycle station points.</p>
      </div>
      <div class="map-hero-badges" aria-label="Map status">
        <span>GPS</span>
        <span>${stations.length} Stations</span>
        <span>Live Points</span>
      </div>
    </section>
    <div class="map-layout">
      <div class="user-map-showcase panel shadow-sm">
        <div class="user-map-top">
          <div>
            <p class="eyebrow">Live Stations</p>
            <h2>Find your closest bins</h2>
          </div>
          <span>GPS</span>
        </div>
        <div class="creative-map-wrap">
          <div class="leaflet-map" id="binMap"></div>
        </div>
        <div class="map-legend-row" aria-label="Map legend">
          <span><b class="available-dot"></b>Available</span>
          <span><b class="busy-dot"></b>Check status</span>
          <span><b class="gps-dot"></b>Your GPS</span>
        </div>
      </div>
      <aside class="station-list-panel panel shadow-sm">
        <p class="eyebrow">Station details</p>
        <div class="station-mini-list">
          ${stations
            .map((station, index) => `
              <button type="button" class="station-list-item" data-map-station="${escapeHtml(station.code)}" aria-label="Show ${escapeHtml(station.name)} on map">
                <span>${index + 1}</span>
                <strong>${escapeHtml(station.name)}</strong>
                <small>${escapeHtml(station.location)}</small>
              </button>
            `)
            .join("")}
        </div>
      </aside>
    </div>
  </section>
`;
};

export const renderScanPage = () => {
  const stations = binStations();
  return `
  <section class="page scan-page">
    <article class="card h-100 shadow-sm scan-control-card">
      <div class="scanner-copy">
        <p class="eyebrow">Location QR</p>
        <h2>QR Scan Checkpoint</h2>
        <p>Scan any station QR code first. EcoCycle will verify your GPS and prepare AI waste detection.</p>
      </div>
      <div class="scan-steps" aria-label="QR scan flow">
        <span><b>1</b> Open camera</span>
        <span><b>2</b> Scan QR</span>
        <span><b>3</b> GPS detect</span>
      </div>
      <div class="scanner-visual-row scanner-visual-panel">
        <div class="scanner-action-stack">
          <button class="scanner-launch" id="scannerLaunch" data-action="start-scanner" aria-label="Open camera QR scanner" title="Open camera QR scanner">
            <span class="qr-scan-frame" aria-hidden="true">
              <span class="qr-corner top-left"></span>
              <span class="qr-corner top-right"></span>
              <span class="qr-corner bottom-left"></span>
              <span class="qr-corner bottom-right"></span>
              <span class="scanner-ring"><img src="/images/qrscan.png" alt=""></span>
              <span class="scan-line"></span>
            </span>
            <strong>Scan QR</strong>
            <small>Point your camera at a station code</small>
          </button>
        </div>
        <div id="qrReader" class="qr-reader hidden"></div>
      </div>
      <div class="scanner-actions hidden" id="scannerActions">
        <button class="icon-btn scanner-icon stop" data-action="stop-scanner" aria-label="Stop QR scanner" title="Stop QR scanner">
          <span aria-hidden="true">x</span>
        </button>
      </div>
      <div class="station-mini-list">
        ${stations.map((station, index) => `
          <button type="button" data-scan="${escapeHtml(station.code)}">
            <span>${index + 1}</span>
            <strong>${escapeHtml(station.name)}</strong>
            <small>${escapeHtml(station.location)}</small>
            <b>${station.bins.some((bin) => bin.status !== "Available") ? "Check" : "Available"}</b>
          </button>
        `).join("")}
      </div>
    </article>
  </section>
`;
};

export const renderBins = ({ guest = false, admin = false } = {}) => `
  ${(() => {
    const stationDirectionsUrl = (station) =>
      `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
    const filteredStations = binStations();
    const featuredStation = filteredStations[0];
    const stationList = filteredStations.slice(0, 4);
    return `
  <section class="page">
    ${sectionTitle(guest ? "Public Bin Location" : admin ? "Bin Status" : "Scan QR Page", guest ? "Each location has Paper, Plastic, Aluminium, and General Waste smart bins." : "Scan the QR code. EcoCycle will automatically use your current GPS location before AI detection.")}
    ${!guest && !admin ? `
      <section class="bins-bento-hero">
        <div>
          <p class="eyebrow">Smart Station Scanner</p>
          <h2>Scan QR. Recycle smarter. <span>Protect Sarawak.</span></h2>
          <p>Scan the QR code at any EcoCycle station. We automatically detect your current location and guide you through AI waste detection.</p>
          <div class="bento-hero-steps">
            <span><b>1</b>Scan QR</span>
            <span><b>2</b>Detect Waste</span>
            <span><b>3</b>Verify Location</span>
            <span><b>4</b>Earn Rewards</span>
          </div>
        </div>
        <div class="bento-hero-art" aria-hidden="true">
          <div class="bento-bin-3d"></div>
          <div class="bento-recycle-badge"><strong>12</strong><span>scans</span></div>
        </div>
      </section>
    ` : ""}
    <div class="${!guest && !admin ? "scan-page-shell" : "map-layout"}">
      <div class="scan-map-panel">
        <div class="user-map-showcase panel shadow-sm">
          <div class="user-map-top">
            <div>
              <p class="eyebrow">Live Station Map</p>
              <h2>Recycle points near you</h2>
            </div>
            <span>GPS</span>
          </div>
          <div class="creative-map-wrap">
            <div class="leaflet-map" id="binMap"></div>
            <div class="map-energy-route" aria-hidden="true"></div>
            <div class="map-orbit one" aria-hidden="true"></div>
            <div class="map-orbit two" aria-hidden="true"></div>
            <div class="map-pulse-pin pin-a" aria-hidden="true"></div>
            <div class="map-pulse-pin pin-b" aria-hidden="true"></div>
            <div class="map-pulse-pin pin-c" aria-hidden="true"></div>
          </div>
          <div class="map-legend-row" aria-label="Map legend">
            <span><b class="available-dot"></b>Available</span>
            <span><b class="busy-dot"></b>Check status</span>
            <span><b class="gps-dot"></b>Your GPS</span>
          </div>
          ${!guest && !admin ? `
            <div class="station-mini-list">
              ${stationList.map((station, index) => `
                <button data-scan="${escapeHtml(station.code)}">
                  <span>${index + 1}</span>
                  <strong>${escapeHtml(station.name)}</strong>
                  <small>${(index + 1) * 1.6} km</small>
                  <b>${station.bins.some((bin) => bin.status !== "Available") ? "Check" : "Available"}</b>
                </button>
              `).join("")}
            </div>
            <button class="view-stations-btn" data-page="locations">View All Stations</button>
          ` : ""}
        </div>
        ${!guest && !admin ? `
          <div class="scan-status-strip">
            <div><strong>${filteredStations.length}</strong><span>Stations</span></div>
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
              <p>Scan any station QR first. EcoCycle automatically detects your current location and prepares the AI waste detection flow.</p>
            </div>
            <div class="scan-steps" aria-label="QR scan flow">
              <span><b>1</b> Open camera</span>
              <span><b>2</b> Scan QR</span>
              <span><b>3</b> GPS detect</span>
            </div>
            <div class="scanner-visual-row scanner-visual-panel">
              <div class="scanner-action-stack">
                <button class="scanner-launch" id="scannerLaunch" data-action="start-scanner" aria-label="Open camera QR scanner" title="Open camera QR scanner">
                  <span class="qr-scan-frame" aria-hidden="true">
                    <span class="qr-corner top-left"></span>
                    <span class="qr-corner top-right"></span>
                    <span class="qr-corner bottom-left"></span>
                    <span class="qr-corner bottom-right"></span>
                    <span class="scanner-ring"><img src="/images/qrscan.png" alt=""></span>
                    <span class="scan-line"></span>
                  </span>
                  <strong>Scan QR</strong>
                  <small>Point your camera at any station code</small>
                </button>
              </div>
              <div id="qrReader" class="qr-reader hidden"></div>
            </div>
            <div class="scanner-actions hidden" id="scannerActions">
              <button class="icon-btn scanner-icon stop" data-action="stop-scanner" aria-label="Stop QR scanner" title="Stop QR scanner">
                <span aria-hidden="true">x</span>
              </button>
            </div>
          </article>
          <aside class="bento-side-panel">
            <article class="station-feature-card">
              <p class="eyebrow">Smart Bin Station</p>
              <h2>${escapeHtml(featuredStation?.name || "EcoCycle Station")}</h2>
              <p>${escapeHtml(featuredStation?.location || "Kuching, Sarawak")}</p>
              <span class="badge available">Online</span>
              <div class="station-bin-visual" aria-hidden="true"></div>
              <div class="capacity-ring"><strong>65%</strong><span>Capacity Used</span></div>
              <a class="primary-btn map-link" href="${featuredStation ? stationDirectionsUrl(featuredStation) : "#"}" target="_blank" rel="noreferrer">Open Directions -&gt;</a>
            </article>
            <article class="reward-card">
              <p class="eyebrow">Earn Rewards</p>
              <h2>Recycle more, earn more points.</h2>
              <button class="primary-btn" data-page="rewards">View Rewards -&gt;</button>
            </article>
          </aside>
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
    ${!guest && !admin ? `
      <section class="bento-status-strip">
        <article><span>${filteredStations.length}</span><strong>Total Stations</strong></article>
        <article><span>AI</span><strong>Detection Active</strong></article>
        <article><span>98%</span><strong>System Uptime</strong></article>
      </section>
      <section class="bento-waste-row">
        <article>
          <img src="/images/recycle-guide-image.png" alt="">
          <div><h3>Paper</h3><p>Newspaper, boxes, magazines.</p><span>Available</span></div>
        </article>
        <article>
          <img src="/images/recycle-bin.jpg" alt="">
          <div><h3>Plastic</h3><p>Bottles, containers, packaging.</p><span>Available</span></div>
        </article>
        <article>
          <img src="/images/recycle-bin-no-bg.png" alt="">
          <div><h3>Aluminium</h3><p>Aluminium cans and beverage tins.</p><span>Available</span></div>
        </article>
        <article>
          <img src="/images/recycle-loading.png" alt="">
          <div><h3>General Waste</h3><p>Wrappers, tissues, contaminated items.</p><span>Available</span></div>
        </article>
        <article class="reward-bento">
          <div><h3>Earn Rewards</h3><p>Recycle more, earn more points.</p><button data-page="rewards">View Rewards -&gt;</button></div>
        </article>
      </section>
      <section class="bento-how-row">
        ${[
          ["1", "Scan QR Code", "Scan the QR code at any station."],
          ["2", "Verify Location", "We check your GPS location."],
          ["3", "AI Detects Waste", "Our AI detects the waste type."],
          ["4", "Dispose Waste", "Put your waste in the smart bin."],
          ["5", "Earn Points", "You earn points and save the planet."],
        ].map(([number, title, text]) => `
          <article><span>${number}</span><div><strong>${title}</strong><p>${text}</p></div></article>
        `).join("")}
      </section>
    ` : ""}
  </section>
`;
  })()}
`;

const rewardImage = (reward) => {
  if (reward.image) return reward.image;
  const name = reward.name.toLowerCase();
  if (name.includes("rm5")) return "reloadpinRM5.png";
  if (name.includes("rm10")) return "reloadpinRM10.png";
  if (name.includes("rm30")) return "reloadpinRM30.png";
  if (name.includes("electricity")) return "electricalbill.jpeg";
  if (name.includes("water")) return "waterbill.jpeg";
  if (name.includes("emart")) return "emart.jpeg";
  if (name.includes("rainforest")) return "rainforest.jpeg";
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
        <button class="btn btn-success primary-btn" data-anchor="home">Home</button>
        <button class="btn btn-outline-success ghost-btn" data-auth="login">Login</button>
      </div>
    </div>
  </section>
`;
