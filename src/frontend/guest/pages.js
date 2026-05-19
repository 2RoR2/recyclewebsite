import { state } from "../../backend/database.js";
import { escapeHtml } from "../shared/templates.js";

const sourceLinks = [
  ["MBKS Green Initiative", "https://mbks.sarawak.gov.my/web/subpage/webpage_view/178"],
  ["DBKU TID", "https://dbku.sarawak.gov.my/page-225-293-318-tid.html"],
  ["World Wildlife Fund", "https://assets.worldwildlife.org/www-prd/documents/8xmq9zvpsz_Reducing_Waste_Guide_1.25.22.pdf"],
  ["Zero Waste Malaysia", "https://trashpedia.zerowastemalaysia.org/en/faq/"],
];

const sourceLink = ([label, url]) => `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;

const renderRecycleGuide = () => `
  <section class="page guest-recycle-guide-page">
    <div class="guest-page-hero guide-hero">
      <p class="eyebrow">Recycle Guide</p>
      <h1>Sort waste with cleaner Sarawak standards.</h1>
      <p>A focused public guide for Paper, Plastic, Aluminium, and General Waste streams at EcoCycle smart-bin points.</p>
    </div>

    <section class="guide-book-section">
      <div class="guide-flipbook" data-guide-flipbook>
        <div class="guide-flipbook-stage">
          <article class="guide-flip-page guide-cover-page is-active" data-guide-page="0">
            <img src="/images/recycle-guide.png" alt="Sarawak recycle guide poster">
          </article>
          <article class="guide-flip-page guide-video-page" data-guide-page="1">
            <p class="eyebrow">Recycle Flow</p>
            <div class="guide-video-frame">
              <iframe
                src="https://www.youtube.com/embed/cNPEH0GOhRw?si=PX0ASvQRr28Xgewm&controls=0&rel=0&modestbranding=1"
                title="Recycling guide video"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerpolicy="strict-origin-when-cross-origin"
                allowfullscreen>
              </iframe>
            </div>
          </article>
          <article class="guide-flip-page guide-index-page" data-guide-page="2">
            <p class="eyebrow">EcoCycle Sarawak</p>
            <h2>Recycling field</h2>
            <div class="guide-book-index">
              ${["Paper", "Plastic", "Aluminium", "General Waste"].map((item, index) => `
                <span><strong>0${index + 1}</strong>${item}</span>
              `).join("")}
            </div>
          </article>
        </div>
        <div class="guide-flip-controls" aria-label="Recycle guide book controls">
          <button type="button" data-guide-flip="prev" aria-label="Previous guide page">&lt;</button>
          <div class="guide-flip-dots" aria-hidden="true">
            <span class="active"></span>
            <span></span>
            <span></span>
          </div>
          <button type="button" data-guide-flip="next" aria-label="Next guide page">&gt;</button>
        </div>
      </div>
    </section>

    <section class="support-source-band guide-source-band">
      <div>
        <p class="eyebrow">Source Library</p>
        <h2>References used for the recycling and enforcement context.</h2>
      </div>
      <div class="source-row all-sources">
        ${sourceLinks.map(sourceLink).join("")}
      </div>
    </section>

    <section class="guide-bottom-design" aria-label="EcoCycle recycle guide visual">
      <img src="/images/recycle-guide-image.png" alt="EcoCycle Sarawak recycling process design">
    </section>
  </section>
`;

const renderSupport = () => `
  <section class="page guest-support-page">
    <div class="guest-page-hero support-hero">
      <p class="eyebrow">Support Center</p>
      <h1>Help for EcoCycle Sarawak users</h1>
      <p>Report a station issue, ask about accepted items, or get help with smart-bin scanning and app feedback.</p>
    </div>

    <div class="support-command-layout">
      <section class="support-primary-panel">
        <div class="sarawak-section-head">
          <p class="eyebrow">Send Request</p>
          <h2>Tell the team what needs attention.</h2>
          <p>Use one clear report for bin overflow, QR scan trouble, location corrections, reward questions, or recycling guidance.</p>
        </div>
        <form class="support-contact-form" data-form="feedback">
          <label>Issue type
            <select name="category" required>
              <option value="">Choose a topic</option>
              <option value="station">Recycle point or smart bin</option>
              <option value="scan">QR scan or account help</option>
              <option value="reward">Rewards and points</option>
              <option value="sorting">Sorting guidance</option>
              <option value="feedback">General feedback</option>
            </select>
          </label>
          <label>Message
            <textarea name="issue" rows="7" placeholder="Example: Saradise aluminium bin needs attention." required>${escapeHtml(state.form.issue)}</textarea>
          </label>
          <button class="primary-btn" type="submit">Submit Support Request -&gt;</button>
        </form>
      </section>

      <aside class="support-service-panel">
        <p class="eyebrow">Contact Desk</p>
        <h2>EcoCycle Sarawak</h2>
        <div class="support-contact-list">
          <a href="tel:0821234567">082-1234567</a>
          <a href="mailto:ecocyclesarawak@gmail.com">ecocyclesarawak@gmail.com</a>
          <span>Kuching, Sarawak, Malaysia</span>
        </div>
        <div class="support-area-list">
          ${["Peach Garden", "Tabuan", "Galacity", "Saradise", "Batu Kawa", "UNIMAS", "UiTM Samarahan"].map((area) => `
            <span>${area}</span>
          `).join("")}
        </div>
      </aside>
    </div>

  </section>
`;
const renderHome = () => `
  <section class="sarawak-hero real-sarawak-hero" id="home" data-home-hero>
    <div class="sarawak-hero-bg" aria-hidden="true">
      <iframe
        id="heroVideoBg"
        src="https://www.youtube.com/embed/KIQueYmDWEQ?si=AgFBOfUsVvtrAmkD&autoplay=1&mute=1&controls=0&loop=1&playlist=KIQueYmDWEQ&playsinline=1&modestbranding=1&rel=0&disablekb=1&fs=0&iv_load_policy=3&enablejsapi=1"
        title="EcoCycle background video"
        tabindex="-1"
        frameborder="0"
        allow="autoplay; encrypted-media"
        referrerpolicy="strict-origin-when-cross-origin"
        aria-hidden="true">
      </iframe>
      <div class="sarawak-hero-video-mask"></div>
    </div>
    <div class="sarawak-hero-copy">
      <p class="eyebrow leaf-eyebrow">Real Sarawak recycling guide</p>
      <h1 data-split-text>Recycle in <span>Sarawak</span> with local facts</h1>
      <p class="lead">A public EcoCycle guide built around real Sarawak council services, Trienekens waste information, local campaigns, and Sarawak community action.</p>
      <div class="hero-actions">
        <button class="btn btn-success primary-btn" data-anchor="points">Find Sarawak Points <span aria-hidden="true">+</span></button>
        <button class="btn btn-light text-btn hero-login" data-page="support">Get Support <span aria-hidden="true">+</span></button>
      </div>
    </div>
    <div class="hero-leaf-sweep" aria-hidden="true"></div>
    <div class="phone-preview" aria-label="Mobile preview">
      <div class="phone-screen">
        <div class="phone-top">
          <img src="/images/recycle-logo.png" alt="">
          <span>Menu</span>
        </div>
        <p class="eyebrow leaf-eyebrow">Together for a greener Sarawak</p>
        <h2>Sarawak recycling, <span>made easier</span></h2>
        <p>Find local council contacts, campaign items, and scan-friendly recycle points.</p>
        <button class="primary-btn" data-anchor="points">Find Points</button>
        <button class="text-btn" data-page="news">News</button>
        <div class="phone-impact">
          <strong>Sarawak</strong>
          <span>Kuching, Batu Kawa, and Samarahan smart recycling areas</span>
        </div>
      </div>
    </div>
  </section>

  <section class="stb-info-grid" id="about">
    <article class="stb-about-card" data-view-step>
      <p class="eyebrow">About Us</p>
      <h2>EcoCycle Sarawak is a local recycling web app concept for Sarawak residents.</h2>
      <p>It organises recycling information into a simpler journey: learn what to sort, find selected station points, understand penalty rules, and use QR scanning in the app prototype.</p>
      <p>Its Sarawak identity follows the stateâ€™s emphasis on culture, adventure, nature, food and festivals, while focusing this platform on cleaner neighbourhoods and practical recycling habits.</p>
      <a class="source-pill" href="https://stb.sarawak.gov.my/web/home/index/" target="_blank" rel="noreferrer">Source: Sarawak Tourism Board</a>
    </article>
    <aside class="stb-quick-links" data-view-step>
      <h2>Public Pages</h2>
      <button data-anchor="about">About Us</button>
      <button data-anchor="points">Recycle Points</button>
      <button data-anchor="campaigns">Campaigns</button>
      <button data-anchor="news">News</button>
      <button data-anchor="contact">Contact</button>
      <button data-page="support">Support</button>
    </aside>
  </section>

  <section class="bin-burst-section" data-bin-burst>
    <div class="bin-burst-copy">
      <div class="flow-title-lockup">
        <h2 data-split-text>Learn the correct recycling flow before disposal.</h2>
        <img class="flow-title-flower" src="/images/recycle-flower.png" alt="" aria-hidden="true">
      </div>
    </div>
    <div class="bin-burst-stage" aria-hidden="true">
      <div class="burst-ring"></div>
      <div class="trash-piece bottle"><span></span></div>
      <div class="trash-piece paper"></div>
      <div class="trash-piece can"></div>
      <div class="trash-piece wrapper"></div>
      <div class="trash-piece carton"></div>
      <div class="trash-piece cup"></div>
      <div class="trash-piece spark spark-one"></div>
      <div class="trash-piece spark spark-two"></div>
      <div class="burst-bin">
        <div class="bin-lid"></div>
        <div class="bin-body">
          <span></span>
        </div>
        <div class="bin-wheel left"></div>
        <div class="bin-wheel right"></div>
      </div>
    </div>
  </section>

  <section class="location-movement" id="points">
    <div class="location-card">
      <div class="sarawak-section-head">
        <p class="eyebrow">Recycle Points</p>
        <h2>Real Sarawak <span>service points</span> and contacts</h2>
        <p>EcoCycle stations are configured with four smart bins at every point: Paper, Plastic, Aluminium, and General Waste.</p>
      </div>
      <div class="sarawak-route-map" data-route-map aria-label="Animated Sarawak recycle point map">
        <svg viewBox="0 0 980 560" role="img" aria-labelledby="routeMapTitle">
          <title id="routeMapTitle">EcoCycle station points</title>
          <path class="sarawak-outline" d="M78 398 L126 360 L177 366 L218 338 L276 344 L327 311 L386 296 L432 268 L487 246 L536 205 L592 160 L646 118 L721 104 L797 70 L873 92 L928 142 L900 204 L934 254 L890 312 L826 303 L772 346 L704 340 L656 383 L592 371 L538 415 L460 402 L398 437 L318 424 L252 456 L176 440 L112 450 Z" />
          <path class="sarawak-inner" d="M172 392 C242 354 308 344 370 312 C444 274 515 228 590 158" />
          <path class="sarawak-inner" d="M396 432 C446 380 502 354 558 315 C612 276 653 223 704 118" />
          <path class="sarawak-inner" d="M592 371 C648 328 709 305 772 346" />
          <path class="route-line route-shadow" d="M126 408 L214 425 L262 388 L326 370 L388 330 L503 292 L637 166 L806 139 L870 172" />
          <path class="route-line route-draw" d="M126 408 L214 425 L262 388 L326 370 L388 330 L503 292 L637 166 L806 139 L870 172" />
          ${[
            ["Peach Garden", 126, 408],
            ["Tabuan", 180, 415],
            ["Galacity", 214, 425],
            ["Saradise", 262, 388],
            ["Batu Kawa", 326, 408],
            ["UNIMAS", 503, 292],
            ["UiTM Samarahan", 637, 166],
          ].map(([name, x, y], index) => `
            <g class="route-point point-${index}" data-route-point style="--point-delay: ${index * 0.16}s">
              <line x1="${x}" y1="${y + 7}" x2="${x}" y2="${y + 42}" />
              <circle cx="${x}" cy="${y}" r="9" />
              <circle class="pin-glow" cx="${x}" cy="${y}" r="18" />
              <text x="${x + 15}" y="${y - 8}">${name}</text>
            </g>
          `).join("")}
          <g class="route-glitter">
            <circle cx="126" cy="408" r="4" />
            <circle cx="180" cy="415" r="3" />
            <circle cx="214" cy="425" r="3" />
            <circle cx="262" cy="388" r="3" />
            <circle cx="326" cy="408" r="3" />
            <circle cx="503" cy="292" r="4" />
            <circle cx="637" cy="166" r="3" />
            <circle cx="870" cy="172" r="4" />
          </g>
        </svg>
        <article class="route-map-detail">
          <p class="eyebrow">Recycle Route</p>
          <h3>EcoCycle smart bin points</h3>
          <p>Key locations in Kuching and Samarahan including Peach Garden, Tabuan, Galacity, and Saradise now feature Paper, Plastic, Aluminium, and General Waste smart bins.</p>
          <button class="primary-btn" data-auth="register">Open App Locations -&gt;</button>
        </article>
      </div>
      <div class="real-point-grid">
        ${[
          ["Peach Garden", "Smart bins located at Jalan Song area.", "https://www.google.com/maps/search/?api=1&query=Peach%20Garden%20Jalan%20Song%20Kuching"],
          ["Tabuan", "Serving the Tabuan Jaya and surrounding communities.", "https://www.google.com/maps/search/?api=1&query=Tabuan%20Kuching"],
          ["Galacity", "Located at the Galacity commercial hub.", "https://www.google.com/maps/search/?api=1&query=Galacity%20Kuching"],
          ["Saradise", "Smart recycling point at the Saradise Innovation Space area.", "https://www.google.com/maps/search/?api=1&query=Saradise%20Kuching"],
          ["Batu Kawa", "Four bins: Paper, Plastic, Aluminium, General Waste.", "https://www.google.com/maps/search/?api=1&query=Batu%20Kawa%20Kuching"],
          ["UNIMAS", "Recycling facilities for students and staff at UNIMAS.", "https://www.google.com/maps/search/?api=1&query=UNIMAS"],
          ["UiTM Samarahan", "Serving the UiTM Samarahan Campus community.", "https://www.google.com/maps/search/?api=1&query=UiTM%20Samarahan"],
        ].map(([title, text, url]) => `
          <article data-view-step>
            <h3>${title}</h3>
            <p>${text}</p>
            <a href="${url}" target="_blank" rel="noreferrer">Official source</a>
          </article>
        `).join("")}
      </div>
    </div>
    <div class="movement-card real-campaign-card" id="campaigns" data-sticky-story>
      <p class="eyebrow">Campaigns</p>
      <h2 data-split-text>Sarawak recycling campaigns</h2>
      <p>Local campaigns are important because they give residents a specific date, location and accepted item list.</p>
      <div class="movement-steps">
        ${[
          ["Council of the Kuching South", "MBKS Green Initiative resources include Buy Back Recycling Campaign links and recycling education references."],
          ["Commission of the City of Kuching North", "DBKU reference is kept for Kuching North council information and enforcement context."],
          ["Zero Waste Malaysia", "Clean and dry recyclables before recycling; mixed-material items may not be accepted by local collectors."],
        ].map(([title, text]) => `
          <article data-view-step>
            <span aria-hidden="true">+</span>
            <strong>${title}</strong>
            <p>${text}</p>
          </article>
        `).join("")}
      </div>
      <button class="primary-btn" data-auth="register">Join EcoCycle +</button>
    </div>
  </section>

  ${renderHomeContactSections()}
`;

const renderNewsPage = () => `
  <section class="page guest-news-page" id="news">
    <div class="guest-page-hero news-hero">
      <div class="news-hero-resource-bg" aria-hidden="true">
        ${[...Array(2)].map(() => `
          ${[
            "resources1.png",
            "resources2.png",
            "resources3.png",
            "resources4.jpg",
          ].map((image) => `<img src="/images/resources/${image}" alt="">`).join("")}
        `).join("")}
      </div>
      <p class="eyebrow">News</p>
      <h1>Recycling intelligence for Sarawak communities</h1>
      <p>Track campaign references, council signals, waste-reduction guidance, and EcoCycle station coverage in one operational view.</p>
    </div>

    <div class="news-layout">
      <article class="news-feature">
        <span>Featured Brief</span>
        <h2>Smart bin guidance reduces wrong-bin disposal before penalties become the issue.</h2>
        <p>EcoCycle treats the first problem as behaviour correction: when rubbish enters the wrong smart bin, the system alerts the user and guides them to the correct Paper, Plastic, Aluminium, or General Waste stream.</p>
        <p>Penalty education is kept visible because public and council bin vandalism can carry serious consequences in Kuching, including compounds, community service, or imprisonment under enforcement context.</p>
        <a href="https://mbks.sarawak.gov.my/web/subpage/webpage_view/178" target="_blank" rel="noreferrer">Read MBKS reference</a>
      </article>
      <aside class="news-ops-panel">
        <h2>Coverage Areas</h2>
        ${["Peach Garden", "Tabuan", "Galacity", "Saradise", "Batu Kawa", "UNIMAS", "UiTM Samarahan"].map((area) => `
          <div><span></span><p>${area}</p></div>
        `).join("")}
      </aside>
    </div>

    <div class="professional-news-grid">
      ${[
        ["Council Reference", "MBKS Green Initiative", "Buy Back Recycling Campaign resources and community recycling education references for Kuching South.", "https://mbks.sarawak.gov.my/web/subpage/webpage_view/178"],
        ["Council Reference", "DBKU TID", "Kuching North reference page linked for council and enforcement context.", "https://dbku.sarawak.gov.my/page-225-293-318-tid.html"],
        ["Waste Guide", "World Wildlife Fund", "Waste-reduction guidance used as a supporting public education reference.", "https://assets.worldwildlife.org/www-prd/documents/8xmq9zvpsz_Reducing_Waste_Guide_1.25.22.pdf"],
        ["Sorting FAQ", "Zero Waste Malaysia", "Malaysia-focused sorting FAQ for common material handling and contamination questions.", "https://trashpedia.zerowastemalaysia.org/en/faq/"],
      ].map(([tag, title, text, url]) => `
        <article data-view-step>
          <span>${tag}</span>
          <h3>${title}</h3>
          <p>${text}</p>
          <a href="${url}" target="_blank" rel="noreferrer">Open source</a>
        </article>
      `).join("")}
    </div>
  </section>
`;

const renderHomeContactSections = () => `
  <section class="news-strip" id="contact">
    <div>
      <p class="eyebrow">Stay Updated</p>
      <h2>Send feedback or ask about a recycle point.</h2>
    </div>
    <form class="newsletter-form" data-form="feedback">
      <input name="issue" type="text" placeholder="Example: Saradise aluminium bin needs attention" aria-label="Feedback">
      <button class="primary-btn" type="submit">Send -&gt;</button>
    </form>
  </section>

  <section class="sticky-story sarawak-loop real-contact-section" data-sticky-story>
    <div class="sticky-story-copy">
      <p class="eyebrow">Contact</p>
      <h2 data-split-text>Useful Sarawak contacts and source links.</h2>
      <p>This app is a student/prototype guide. For official collection, campaign schedules or complaints, contact the council or organiser directly.</p>
    </div>
    <div class="sticky-story-track contact-source-track" aria-label="Sarawak source links">
      ${[
        ["EcoCycle", "App feedback", "Station issues, scanning flow, and recycling-point updates"],
        ["DBKU", "Kuching North", "Commission of the City of Kuching North reference"],
        ["MBKS", "Kuching South", "Council of the City of Kuching South reference"],
        ["WWF", "Waste guide", "Waste reduction and disposal education"],
        ["Zero Waste Malaysia", "Sorting FAQ", "Malaysia-focused sorting questions"],
      ].map(([number, title, text]) => `
        <article class="sticky-step" data-view-step>
          <span>${number}</span>
          <h3>${title}</h3>
          <p>${text}</p>
        </article>
      `).join("")}
    </div>
    <div class="source-row all-sources">
      ${sourceLinks.map(sourceLink).join("")}
    </div>
  </section>
`;

const renderAuth = ({ embedded = false } = {}) => {
  const isLogin = state.authMode === "login";

  return `
    <section class="${embedded ? "auth-embedded" : "page auth-wrap"}">
      <div class="${embedded ? "" : "auth-stage panel card shadow-lg border-0"}">
        <div class="${embedded ? "" : "auth-visual"}" data-auth-mascot>
          ${embedded ? "" : `
            <div class="auth-cloud auth-cloud-one"></div>
            <div class="auth-cloud auth-cloud-two"></div>
            <div class="auth-spark auth-spark-one"></div>
            <div class="auth-spark auth-spark-two"></div>
            <div class="auth-bin-friend" aria-hidden="true">
              <div class="auth-bin-lid"></div>
              <div class="auth-bin-body">
                <span class="auth-bin-slot"></span>
                <div class="auth-eye auth-eye-left"><span class="auth-pupil"></span></div>
                <div class="auth-eye auth-eye-right"><span class="auth-pupil"></span></div>
                <span class="auth-bin-smile"></span>
              </div>
              <span class="auth-bin-wheel auth-bin-wheel-left"></span>
              <span class="auth-bin-wheel auth-bin-wheel-right"></span>
            </div>
            <div class="auth-visual-copy">
              <strong>${isLogin ? "Welcome back" : "Start your smart journey"}</strong>
              <span>${isLogin ? "Your dashboard is ready." : "Create an account and collect points."}</span>
            </div>
          `}
        </div>
        <div class="${embedded ? "" : "auth-form-panel"}">
          <p class="eyebrow">${isLogin ? "Welcome back" : "Create account"}</p>
          <h1>${isLogin ? "Login" : "Sign Up"}</h1>
          <p class="lead">${isLogin ? "Continue scanning bins and redeeming rewards." : "Create an account for scan history, points, rewards, and learning records."}</p>
          <form class="form" data-form="${isLogin ? "login" : "register"}">
            ${isLogin ? "" : `
              <label>Username
                <input name="name" autocomplete="name" minlength="2" placeholder="Example: Aina" value="${escapeHtml(state.form.name)}">
              </label>
            `}
            <label>Email
              <input name="email" type="email" autocomplete="email" placeholder="you@example.com" value="${escapeHtml(state.form.email)}">
            </label>
            <label>Password
              <input name="password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" ${isLogin ? "" : "minlength=\"8\" pattern=\"(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}\""} placeholder="${isLogin ? "Enter your password" : "At least 8 characters"}" value="${escapeHtml(state.form.password)}">
            </label>
            <button class="btn btn-success primary-btn" type="submit">${isLogin ? "Login" : "Sign Up"}</button>
          </form>
          <div class="demo-row">
            <button class="btn btn-outline-success ghost-btn" data-demo="user">Fill User Demo</button>
            <button class="btn btn-outline-success ghost-btn" data-demo="admin">Fill Admin Demo</button>
          </div>
          ${embedded ? "" : `<button class="btn btn-light text-btn" data-auth="${isLogin ? "register" : "login"}">${isLogin ? "Need an account? Sign up" : "Already have an account? Login"}</button>`}
        </div>
      </div>
    </section>
  `;
};

const renderGuestPage = () => {
  if (state.page === "auth") return renderAuth();
  if (state.page === "news") return renderNewsPage();
  if (state.page === "support") return renderSupport();
  if (state.page === "recycle-guide") return renderRecycleGuide();
  return renderHome();
};

export { renderGuestPage };
