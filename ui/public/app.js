/* ============================================================
   SPUR — Machine-Native Economic Obligations
   Authorization → Obligation → Execute → Verify → Settle
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => [...(c || document).querySelectorAll(s)];

  const BUYER = { name: "ResearchBot", id: "ERC-8004 #817", network: "Celo Mainnet" };

  const OBLIGATIONS = [
    { id: "OBL-1042", buyer: "ResearchBot", buyerId: "ERC-8004 #817", supplier: "Agent Alpha", supplierId: "ERC-8004 #291", task: "FX_REPORT_1042", taskHash: "0x7ab3...f41c", maxAmount: "0.42 USDC", actualAmount: "0.31 USDC", expiry: "60s", status: "settled", created: "2h ago", verifier: "SPUR-V", condition: "report_hash = H(timestamp, source, usd_ngn, confidence), freshness < 300s" },
    { id: "OBL-1043", buyer: "ResearchBot", buyerId: "ERC-8004 #817", supplier: "Agent Beta", supplierId: "ERC-8004 #291", task: "MARKET_DATA_1043", taskHash: "0x9cd2...a73b", maxAmount: "0.80 USDC", actualAmount: "0 USDC", expiry: "300s", status: "executing", created: "5m ago", verifier: "SPUR-V", condition: "data schema valid, freshness < 300s, source verified" },
    { id: "OBL-1044", buyer: "Agent-03", buyerId: "ERC-8004 #412", supplier: "Agent Gamma", supplierId: "ERC-8004 #819", task: "AUDIT_1044", taskHash: "0x1ef5...b82d", maxAmount: "1.00 USDC", actualAmount: "0.92 USDC", expiry: "7d", status: "verified", created: "1d ago", verifier: "SPUR-V", condition: "audit coverage >= 90%, all critical findings reported" },
    { id: "OBL-1045", buyer: "ResearchBot", buyerId: "ERC-8004 #817", supplier: "Agent Alpha", supplierId: "ERC-8004 #291", task: "COMPUTE_1045", taskHash: "0x4a8c...d91e", maxAmount: "0.25 USDC", actualAmount: "0 USDC", expiry: "60s", status: "expired", created: "3h ago", verifier: "SPUR-V", condition: "computation completed within timeout" },
  ];

  const SUPPLIERS = [
    { name: "Agent Alpha", id: "ERC-8004 #291", fulfilled: 98, price: "$0.42", avgTime: "2 min", orders: 47, earnings: "19.74 USDC", status: "active" },
    { name: "Agent Beta", id: "ERC-8004 #291", fulfilled: 91, price: "$0.31", avgTime: "4 min", orders: 23, earnings: "7.13 USDC", status: "active" },
    { name: "Agent Gamma", id: "ERC-8004 #819", fulfilled: 99, price: "$0.55", avgTime: "90 sec", orders: 61, earnings: "33.55 USDC", status: "active" },
  ];

  const FINANCING = [
    { id: "FIN-001", obligationId: "OBL-1042", supplier: "Agent Alpha", advance: "0.29 USDC", fee: "0.01 USDC", status: "settled", advanceRate: "69%", authorizedExposure: "0.42 USDC", maxRecoverable: "0.42 USDC", task: "FX_REPORT_1042" },
    { id: "FIN-002", obligationId: "OBL-1043", supplier: "Agent Beta", advance: "0.56 USDC", fee: "0.01 USDC", status: "active", advanceRate: "70%", authorizedExposure: "0.80 USDC", maxRecoverable: "0.80 USDC", task: "MARKET_DATA_1043" },
  ];

  const DEMOS = {
    success: {
      title: "LEGITIMATE OBLIGATION",
      subtitle: "Authorization → obligation → execution → verification → settlement",
      steps: [
        { label: "BUYER AUTHORIZES", state: "done", desc: "ResearchBot signs: $0.42 max, Agent Alpha, FX report, 60s expiry" },
        { label: "SPUR CREATES OBLIGATION", state: "done", desc: "OBL-1042 materialized — no money moved yet" },
        { label: "SUPPLIER EXECUTES", state: "active", desc: "Agent Alpha produces verified FX report" },
        { label: "VERIFIER CHECKS", state: "pending", desc: "Schema, hash, freshness, source" },
        { label: "SETTLEMENT", state: "pending", desc: "$0.31 → Alpha, $0.11 unused returned" },
      ],
      obligation: { id: "OBL-1042", buyer: "ResearchBot", supplier: "Agent Alpha", task: "FX_REPORT_1042", maxAmount: "0.42 USDC", actualAmount: "0.31 USDC", expiry: "60s", status: "executing", verifier: "SPUR-V" },
    },
    badReport: {
      title: "VERIFICATION FAILED",
      subtitle: "Bad work → verification failure → $0 settlement",
      steps: [
        { label: "BUYER AUTHORIZES", state: "done", desc: "$0.80 max, Agent Beta, market data, 300s" },
        { label: "SPUR CREATES OBLIGATION", state: "done", desc: "OBL-1043 materialized" },
        { label: "SUPPLIER EXECUTES", state: "done", desc: "Agent Beta submits output" },
        { label: "VERIFIER CHECKS", state: "blocked", desc: "SCHEMA FAIL — missing required field: confidence" },
        { label: "SETTLEMENT BLOCKED", state: "blocked", desc: "OBLIGATION REJECTED — $0.00 SETTLED" },
      ],
      blocked: true,
      reason: "Verification failed — delivery missing required field 'confidence'. No settlement. No financier claim. PO expires.",
      obligation: { id: "OBL-1043", buyer: "ResearchBot", supplier: "Agent Beta", task: "MARKET_DATA_1043", maxAmount: "0.80 USDC", actualAmount: "$0.00", expiry: "300s", status: "rejected" },
    },
    wrongSupplier: {
      title: "WRONG SUPPLIER",
      subtitle: "Unauthorized agent tries to execute",
      steps: [
        { label: "AGENT GAMMA ATTEMPTS", state: "done", desc: "Tries to fulfill OBL-1042" },
        { label: "SUPPLIER CHECK", state: "blocked", desc: "OBL-1042 bound to Agent Alpha, not Gamma" },
        { label: "EXECUTION BLOCKED", state: "blocked", desc: "NO FUNDS MOVED" },
      ],
      blocked: true,
      reason: "Wrong supplier — OBL-1042 is bound to Agent Alpha (ERC-8004 #291). Agent Gamma is not authorized.",
      obligation: { id: "OBL-1042", buyer: "ResearchBot", supplier: "Agent Alpha", task: "FX_REPORT_1042", maxAmount: "0.42 USDC", status: "authorized" },
    },
    overLimit: {
      title: "OVER LIMIT",
      subtitle: "Settlement exceeds authorized ceiling",
      steps: [
        { label: "DELIVERY RECEIVED", state: "done", desc: "Agent Alpha delivers report" },
        { label: "VERIFICATION PASSED", state: "done", desc: "All conditions pass" },
        { label: "SETTLEMENT ATTEMPT", state: "blocked", desc: "Actual cost $0.52 > authorized $0.42" },
        { label: "OVER LIMIT BLOCKED", state: "blocked", desc: "Settlement capped at ceiling" },
      ],
      blocked: true,
      reason: "Over limit — actual cost $0.52 exceeds authorized maximum $0.42. Settlement capped at $0.42.",
      obligation: { id: "OBL-1042", buyer: "ResearchBot", supplier: "Agent Alpha", task: "FX_REPORT_1042", maxAmount: "0.42 USDC", status: "verified" },
    },
    doubleSettle: {
      title: "DOUBLE SETTLE",
      subtitle: "Same authorization consumed twice",
      steps: [
        { label: "FIRST SETTLEMENT", state: "done", desc: "$0.31 settled against OBL-1042" },
        { label: "SECOND ATTEMPT", state: "blocked", desc: "OBL-1042 already consumed" },
        { label: "DOUBLE SETTLE BLOCKED", state: "blocked", desc: "NO FUNDS MOVED" },
      ],
      blocked: true,
      reason: "Double settlement — OBL-1042 authorization already consumed. One settlement per obligation.",
      obligation: { id: "OBL-1042", buyer: "ResearchBot", supplier: "Agent Alpha", task: "FX_REPORT_1042", maxAmount: "0.42 USDC", status: "settled" },
    },
    expired: {
      title: "EXPIRED OBLIGATION",
      subtitle: "Authorization window closed",
      steps: [
        { label: "AGENT ATTEMPTS", state: "done", desc: "Tries to execute OBL-1045" },
        { label: "EXPIRY CHECK", state: "blocked", desc: "OBL-1045 expired 2h ago" },
        { label: "EXECUTION BLOCKED", state: "blocked", desc: "NO FUNDS MOVED" },
      ],
      blocked: true,
      reason: "Expired — OBL-1045 authorization expired. Buyer must create new obligation.",
      obligation: { id: "OBL-1045", buyer: "ResearchBot", supplier: "Agent Alpha", task: "COMPUTE_1045", maxAmount: "0.25 USDC", status: "expired" },
    },
  };

  let currentRoute = "";
  let currentCoreScene = null;

  function getRoute() { const p = location.pathname; if (p === "/" || p === "") return "landing"; if (p === "/app" || p === "/app/overview") return "overview"; return p.replace("/app/", "") || "overview"; }

  function navigate(route) {
    if (route === "landing") { history.pushState(null, "", "/"); $("#landing").style.display = ""; $("#app").style.display = "none"; initLanding(); }
    else { history.pushState(null, "", "/app/" + route); $("#landing").style.display = "none"; $("#app").style.display = "flex"; initApp(route); }
    currentRoute = route; window.scrollTo(0, 0);
  }

  function initApp(page) {
    $$(".sidebar__link").forEach(l => l.classList.toggle("sidebar__link--active", l.dataset.page === page));
    const c = $("#page-content"); c.style.animation = "none"; c.offsetHeight; c.style.animation = "";
    switch (page) {
      case "overview": renderOverview(c); break;
      case "obligations": renderObligations(c); break;
      case "suppliers": renderSuppliers(c); break;
      case "financing": renderFinancing(c); break;
      case "demo": renderDemo(c); break;
      case "settings": renderSettings(c); break;
      default: renderOverview(c);
    }
    if (page === "overview") initOverviewCore();
  }

  /* ─── Landing ─── */
  function initLanding() { initHeroCore(); initLandingAnimations(); initHeroDemo(); }
  let heroCoreScene = null;
  function initHeroCore() { const el = $("#hero-core"); if (!el || !window.SpurCore) return; if (heroCoreScene) heroCoreScene.dispose(); heroCoreScene = new window.SpurCore.SpurCoreScene(el.parentElement, { interactive: true, autoRotate: true }); }

  function initLandingAnimations() {
    if (typeof gsap === "undefined") return;
    const els = [$(".hero__badge"), ...$$(".hero__line"), $(".hero__sub"), $(".hero__actions"), $(".hero__loop")].filter(Boolean);
    gsap.set(els, { opacity: 0, y: 30 });
    els.forEach((el, i) => gsap.to(el, { opacity: 1, y: 0, duration: 0.8, delay: 2.5 + i * 0.2, ease: "power3.out" }));
    if (typeof ScrollTrigger !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
      $$(".loop__node, .claims__step, .why__card").forEach((el, i) => { gsap.from(el, { opacity: 0, y: 40, duration: 0.6, delay: i * 0.08, ease: "back.out(1.4)", scrollTrigger: { trigger: el, start: "top 85%", once: true } }); });
      $$(".section__headline, .section__future-headline").forEach(el => { gsap.from(el, { opacity: 0, y: 30, duration: 0.8, scrollTrigger: { trigger: el, start: "top 85%", once: true } }); });
    }
  }

  function initHeroDemo() {
    const btn = $("#run-demo"); if (!btn) return;
    btn.addEventListener("click", () => {
      if (btn.classList.contains("running")) return; btn.classList.add("running");
      const nodes = $$(".loop__node");
      if (typeof gsap !== "undefined") {
        const tl = gsap.timeline({ onComplete: () => btn.classList.remove("running") });
        nodes.forEach((n, i) => { tl.to(n, { borderColor: "var(--gold)", boxShadow: "0 0 15px rgba(180,83,9,.2)", duration: 0.3 }, i * 0.35); tl.to(n, { borderColor: "var(--border)", boxShadow: "var(--shadow-sm)", duration: 0.3 }, i * 0.35 + 0.4); });
      } else { setTimeout(() => btn.classList.remove("running"), 2500); }
    });
  }

  /* ─── Obligation Card ─── */
  function renderObligationCard(o) {
    const s = o.status; const isActive = s === "authorized" || s === "executing"; const isSettled = s === "settled" || s === "verified";
    return '<div class="obligation-card">' +
      '<div class="obligation-card__header obligation-card__header--' + s + '">' +
        '<div class="obligation-card__id">' + o.id + '</div>' +
        '<div class="obligation-card__amount">' + o.maxAmount + '</div>' +
        '<div class="obligation-card__subtitle">ECONOMIC OBLIGATION</div>' +
      '</div>' +
      '<div class="obligation-card__body">' +
        '<div class="obligation-card__row"><span class="obligation-card__label">BUYER</span><span class="obligation-card__value">' + o.buyer + ' (' + o.buyerId + ')</span></div>' +
        '<div class="obligation-card__row"><span class="obligation-card__label">SUPPLIER</span><span class="obligation-card__value">' + o.supplier + '</span></div>' +
        '<div class="obligation-card__row"><span class="obligation-card__label">TASK</span><span class="obligation-card__value">' + o.task + '</span></div>' +
        '<div class="obligation-card__row"><span class="obligation-card__label">TASK HASH</span><span class="obligation-card__value obligation-card__value--mono">' + o.taskHash + '</span></div>' +
        '<div class="obligation-card__row"><span class="obligation-card__label">EXPIRY</span><span class="obligation-card__value">' + o.expiry + '</span></div>' +
        '<div class="obligation-card__row"><span class="obligation-card__label">VERIFIER</span><span class="obligation-card__value">' + o.verifier + '</span></div>' +
        (o.actualAmount !== undefined ? '<div class="obligation-card__row"><span class="obligation-card__label">ACTUAL</span><span class="obligation-card__value obligation-card__value--mono">' + o.actualAmount + '</span></div>' : '') +
        '<div class="obligation-card__row"><span class="obligation-card__label">CONDITION</span><span class="obligation-card__value">' + o.condition + '</span></div>' +
      '</div>' +
      '<div class="obligation-card__footer">' +
        '<div class="obligation-card__status obligation-card__status--' + s + '">' + (isActive ? '● ' + s.toUpperCase() : isSettled ? '✓ ' + s.toUpperCase() : '⏳ ' + s.toUpperCase()) + '</div>' +
      '</div>' +
    '</div>';
  }

  /* ─── Supplier Card ─── */
  function renderSupplierCard(s) {
    return '<div class="supplier-card">' +
      '<div class="supplier-card__header">' +
        '<div class="supplier-card__name">' + s.name + '</div>' +
        '<div class="supplier-card__id">' + s.id + '</div>' +
      '</div>' +
      '<div class="supplier-card__body">' +
        '<div class="supplier-card__row"><span class="supplier-card__label">FULFILLMENT</span><span class="supplier-card__value supplier-card__value--green">' + s.fulfilled + '%</span></div>' +
        '<div class="supplier-card__row"><span class="supplier-card__label">PRICE</span><span class="supplier-card__value">' + s.price + '</span></div>' +
        '<div class="supplier-card__row"><span class="supplier-card__label">AVG TIME</span><span class="supplier-card__value">' + s.avgTime + '</span></div>' +
        '<div class="supplier-card__row"><span class="supplier-card__label">ORDERS</span><span class="supplier-card__value">' + s.orders + '</span></div>' +
        '<div class="supplier-card__row"><span class="supplier-card__label">EARNINGS</span><span class="supplier-card__value supplier-card__value--gold">' + s.earnings + '</span></div>' +
      '</div>' +
    '</div>';
  }

  /* ─── Financing Card ─── */
  function renderFinancingCard(f) {
    return '<div class="financing-card">' +
      '<div class="financing-card__header financing-card__header--' + f.status + '">' +
        '<div class="financing-card__id">' + f.id + '</div>' +
        '<div class="financing-card__advance">' + f.advance + '</div>' +
        '<div class="financing-card__subtitle">ADVANCE AGAINST OBLIGATION</div>' +
      '</div>' +
      '<div class="financing-card__obligation-anchor">' +
        '<div class="financing-card__anchor-label">ANCHORED TO</div>' +
        '<div class="financing-card__anchor-row"><span class="financing-card__anchor-key">OBLIGATION</span><span class="financing-card__anchor-val">' + f.obligationId + '</span></div>' +
        '<div class="financing-card__anchor-row"><span class="financing-card__anchor-key">TASK</span><span class="financing-card__anchor-val">' + f.task + '</span></div>' +
        '<div class="financing-card__anchor-row"><span class="financing-card__anchor-key">AUTHORIZED EXPOSURE</span><span class="financing-card__anchor-val financing-card__anchor-val--gold">' + f.authorizedExposure + '</span></div>' +
        '<div class="financing-card__anchor-row"><span class="financing-card__anchor-key">MAX RECOVERABLE</span><span class="financing-card__anchor-val financing-card__anchor-val--green">' + f.maxRecoverable + '</span></div>' +
      '</div>' +
      '<div class="financing-card__body">' +
        '<div class="financing-card__row"><span class="financing-card__label">SUPPLIER</span><span class="financing-card__value">' + f.supplier + '</span></div>' +
        '<div class="financing-card__row"><span class="financing-card__label">ADVANCE</span><span class="financing-card__value">' + f.advance + '</span></div>' +
        '<div class="financing-card__row"><span class="financing-card__label">FEE</span><span class="financing-card__value">' + f.fee + '</span></div>' +
        '<div class="financing-card__row"><span class="financing-card__label">ADVANCE RATE</span><span class="financing-card__value">' + f.advanceRate + ' of obligation</span></div>' +
      '</div>' +
      '<div class="financing-card__footer">' +
        '<div class="financing-card__status financing-card__status--' + f.status + '">' + (f.status === "active" ? '● ACTIVE — AWAITING SETTLEMENT' : '✓ SETTLED — LP REPAID') + '</div>' +
      '</div>' +
    '</div>';
  }

  /* ─── Pages ─── */
  function renderOverview(el) {
    const active = OBLIGATIONS.filter(o => o.status === "authorized" || o.status === "executing").length;
    const settled = OBLIGATIONS.filter(o => o.status === "settled" || o.status === "verified").length;
    const totalSettled = "3.23 USDC";
    const totalAdvanced = "0.85 USDC";
    el.innerHTML =
      '<div class="page-header"><div class="page-header__label">MACHINE-NATIVE ECONOMIC OBLIGATIONS</div><h1 class="page-header__title">Good ' + getTime() + ', Agent.</h1><p class="page-header__sub">SPUR is creating and settling economic obligations.</p></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem"><div style="display:flex;align-items:center;gap:.5rem;font-family:var(--mono);font-size:.75rem;padding:.5rem 1rem;background:var(--green-soft);color:var(--green);border-radius:100px;font-weight:600;width:fit-content"><span style="width:8px;height:8px;border-radius:50%;background:var(--green);animation:breathe 2s ease-in-out infinite"></span> CELO — SETTLING</div></div>' +
      '<div class="core-3d-container" id="overview-core"></div>' +
      '<div class="stat-grid" style="margin-top:1.5rem">' +
        '<div class="stat-card"><div class="stat-card__label">ACTIVE OBLIGATIONS</div><div class="stat-card__value">' + active + '</div><div class="stat-card__change stat-card__change--up">authorized & executing</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">SETTLED</div><div class="stat-card__value">' + settled + '</div><div class="stat-card__change stat-card__change--up">verified & paid</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">TOTAL SETTLED</div><div class="stat-card__value">' + totalSettled + '</div><div class="stat-card__change stat-card__change--up">through SPUR</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">TOTAL ADVANCED</div><div class="stat-card__value">' + totalAdvanced + '</div><div class="stat-card__change stat-card__change--up">supplier working capital</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:1.5rem">' +
        '<div class="card"><div class="label" style="margin-bottom:1rem">LATEST OBLIGATIONS</div>' +
          OBLIGATIONS.slice(0,3).map(o => '<div style="display:flex;justify-content:space-between;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--border)"><div><div style="font-weight:600;font-size:.9rem">' + o.task + '</div><div style="font-family:var(--mono);font-size:.7rem;color:var(--text-dim)">' + o.id + ' · ' + o.supplier + '</div></div><div style="text-align:right"><div style="font-weight:600;font-size:.85rem">' + o.maxAmount + '</div><div class="timeline__status timeline__status--' + o.status + '">' + o.status.toUpperCase() + '</div></div></div>').join('') +
        '</div>' +
        '<div class="card"><div class="label" style="margin-bottom:1rem">QUICK ACTIONS</div>' +
          '<button class="btn btn--primary btn--sm" style="width:100%;justify-content:center;margin-bottom:.8rem" onclick="window._nav(\'obligations\')">VIEW OBLIGATIONS →</button>' +
          '<button class="btn btn--ghost btn--sm" style="width:100%;justify-content:center;margin-bottom:.8rem" onclick="window._nav(\'demo\')">OPEN DEMO LAB →</button>' +
          '<button class="btn btn--ghost btn--sm" style="width:100%;justify-content:center" onclick="window._nav(\'suppliers\')">VIEW SUPPLIERS →</button>' +
        '</div>' +
      '</div>';
  }

  function initOverviewCore() { const el = $("#overview-core"); if (!el || !window.SpurCore) return; if (currentCoreScene) currentCoreScene.dispose(); currentCoreScene = new window.SpurCore.SpurCoreScene(el, { interactive: true, autoRotate: true, state: "idle" }); }

  function renderObligations(el) {
    el.innerHTML =
      '<div class="page-header"><div class="page-header__label">ECONOMIC OBLIGATIONS</div><h1 class="page-header__title">Obligations</h1><p class="page-header__sub">' + OBLIGATIONS.length + ' obligations. Bounded commitments. Conditional settlement.</p></div>' +
      '<div class="obligation-grid">' + OBLIGATIONS.map(o => renderObligationCard(o)).join('') + '</div>';
  }

  function renderSuppliers(el) {
    el.innerHTML =
      '<div class="page-header"><div class="page-header__label">AGENT SUPPLIERS</div><h1 class="page-header__title">Suppliers</h1><p class="page-header__sub">' + SUPPLIERS.length + ' suppliers. ERC-8004 verified. Executing against obligations.</p></div>' +
      '<div class="supplier-grid">' + SUPPLIERS.map(s => renderSupplierCard(s)).join('') + '</div>';
  }

  function renderFinancing(el) {
    el.innerHTML =
      '<div class="page-header"><div class="page-header__label">OBLIGATION-BACKED LIQUIDITY</div><h1 class="page-header__title">Financing</h1><p class="page-header__sub">' + FINANCING.length + ' advances. Against verified obligations. Repaid on settlement.</p></div>' +
      '<div class="financing-grid">' + FINANCING.map(f => renderFinancingCard(f)).join('') + '</div>' +
      '<div style="margin-top:2rem;padding:2rem;background:var(--bg-elevated);border:1.5px solid var(--border);border-radius:var(--radius-lg)">' +
        '<div class="label" style="margin-bottom:1rem">HOW OBLIGATION FINANCING WORKS</div>' +
        '<div style="display:flex;flex-direction:column;gap:.5rem">' +
          '<div style="display:flex;align-items:center;gap:1rem;padding:.7rem 1rem;background:var(--green-soft);border:1px solid rgba(22,163,74,.2);border-radius:var(--radius-md)"><div style="width:22px;height:22px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:600">1</div><div style="flex:1"><div style="font-family:var(--mono);font-size:.75rem;font-weight:600;color:var(--green)">OBLIGATION AUTHORIZED</div><div style="font-size:.7rem;color:var(--text-dim)">Buyer signs bounded commitment</div></div></div>' +
          '<div style="display:flex;align-items:center;gap:1rem;padding:.7rem 1rem;background:var(--green-soft);border:1px solid rgba(22,163,74,.2);border-radius:var(--radius-md)"><div style="width:22px;height:22px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:600">2</div><div style="flex:1"><div style="font-family:var(--mono);font-size:.75rem;font-weight:600;color:var(--green)">LP ADVANCES CAPITAL</div><div style="font-size:.7rem;color:var(--text-dim)">Supplier gets funds before delivery</div></div></div>' +
          '<div style="display:flex;align-items:center;gap:1rem;padding:.7rem 1rem;background:var(--green-soft);border:1px solid rgba(22,163,74,.2);border-radius:var(--radius-md)"><div style="width:22px;height:22px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:600">3</div><div style="flex:1"><div style="font-family:var(--mono);font-size:.75rem;font-weight:600;color:var(--green)">SUPPLIER EXECUTES WORK</div><div style="font-size:.7rem;color:var(--text-dim)">Buys services, produces deliverable</div></div></div>' +
          '<div style="display:flex;align-items:center;gap:1rem;padding:.7rem 1rem;background:var(--green-soft);border:1px solid rgba(22,163,74,.2);border-radius:var(--radius-md)"><div style="width:22px;height:22px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:600">4</div><div style="flex:1"><div style="font-family:var(--mono);font-size:.75rem;font-weight:600;color:var(--green)">VERIFICATION + SETTLEMENT</div><div style="font-size:.7rem;color:var(--text-dim)">LP repaid, supplier keeps margin</div></div></div>' +
        '</div>' +
      '</div>';
  }

  function renderDemo(el) {
    el.innerHTML =
      '<div class="page-header"><div class="page-header__label">DEVELOPER PLAYGROUND</div><h1 class="page-header__title">SPUR Lab</h1><p class="page-header__sub">Break the obligation. See what SPUR protects.</p></div>' +
      '<div class="demo-lab">' +
        '<div class="demo-lab__scenarios">' +
          Object.entries(DEMOS).map(([k,v],i) => '<div class="demo-scenario ' + (i===0?"demo-scenario--active":"") + '" data-scenario="' + k + '"><div class="demo-scenario__name">' + v.title + '</div><div class="demo-scenario__desc">' + v.subtitle + '</div></div>').join('') +
        '</div>' +
        '<div class="core-3d-container" id="demo-core" style="height:200px;margin-bottom:1.5rem"></div>' +
        '<div id="demo-scene" class="demo-lab__scene"></div>' +
      '</div>';
    const cc = $("#demo-core"); if (cc && window.SpurCore) { if (currentCoreScene) currentCoreScene.dispose(); currentCoreScene = new window.SpurCore.SpurCoreScene(cc, { interactive: true, autoRotate: true }); }
    $$(".demo-scenario", el).forEach(s => { s.addEventListener("click", () => { $$(".demo-scenario", el).forEach(x => x.classList.remove("demo-scenario--active")); s.classList.add("demo-scenario--active"); renderDemoScenario(s.dataset.scenario); }); });
    renderDemoScenario("success");
  }

  function renderDemoScenario(key) {
    const scene = $("#demo-scene"); if (!scene) return;
    const s = DEMOS[key];
    if (currentCoreScene) { currentCoreScene.setState(s.blocked ? "blocked" : "routing"); if (key === "success") currentCoreScene.playRouteAnimation(3); }
    let html = '<div style="width:100%"><div style="font-family:var(--mono);font-size:.7rem;letter-spacing:.12em;color:var(--text-dim);margin-bottom:.5rem">' + s.title + '</div><div style="font-size:.9rem;color:var(--text-muted);margin-bottom:1.5rem">' + s.subtitle + '</div>';

    html += '<div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:2rem">' +
      s.steps.map(step => '<div style="display:flex;align-items:center;gap:1rem;padding:.7rem 1rem;background:' + (step.state==="blocked"?"var(--red-soft)":step.state==="done"?"var(--green-soft)":step.state==="active"?"var(--bg-elevated)":"var(--bg-warm)") + ';border:1.5px solid ' + (step.state==="blocked"?"rgba(220,38,38,.2)":step.state==="done"?"rgba(22,163,74,.2)":"var(--border)") + ';border-radius:var(--radius-md)"><div style="width:22px;height:22px;border-radius:50%;background:' + (step.state==="blocked"?"var(--red)":step.state==="done"?"var(--green)":step.state==="active"?"var(--gold)":"var(--border)") + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:600;flex-shrink:0">' + (step.state==="done"?"✓":step.state==="blocked"?"✕":step.state==="active"?"●":"○") + '</div><div style="flex:1"><div style="font-family:var(--mono);font-size:.75rem;font-weight:600;' + (step.state==="blocked"?"color:var(--red)":step.state==="done"?"color:var(--green)":"") + '">' + step.label + '</div><div style="font-size:.7rem;color:var(--text-dim);margin-top:.1rem">' + step.desc + '</div></div></div>').join('') + '</div>';

    if (s.obligation) html += renderObligationCard(s.obligation);

    if (s.blocked && s.reason) {
      html += '<div style="margin-top:1.5rem;padding:1.5rem;background:var(--navy);color:#fff;border-radius:var(--radius-lg);position:relative;overflow:hidden">' +
        '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--red)"></div>' +
        '<div style="font-family:var(--mono);font-size:.65rem;letter-spacing:.15em;color:rgba(255,255,255,.5);margin-bottom:1rem">PROTOCOL DECISION</div>' +
        '<div style="display:flex;align-items:center;gap:.8rem;margin-bottom:1rem"><div style="width:32px;height:32px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:700">✕</div><div style="font-size:1.1rem;font-weight:700;color:var(--red)">BLOCKED</div></div>' +
        '<div style="padding:1rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-md);margin-bottom:1rem">' +
          '<div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.1em;color:rgba(255,255,255,.4);margin-bottom:.5rem">ECONOMIC CONSEQUENCE</div>' +
          '<div style="font-size:.95rem;color:rgba(255,255,255,.8)">' + s.reason + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:1rem;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:120px;padding:.8rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-md);text-align:center"><div style="font-family:var(--mono);font-size:.55rem;letter-spacing:.1em;color:rgba(255,255,255,.4);margin-bottom:.3rem">SETTLEMENT</div><div style="font-size:1.1rem;font-weight:700;color:var(--red)">$0.00</div></div>' +
          '<div style="flex:1;min-width:120px;padding:.8rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-md);text-align:center"><div style="font-family:var(--mono);font-size:.55rem;letter-spacing:.1em;color:rgba(255,255,255,.4);margin-bottom:.3rem">FUNDS MOVED</div><div style="font-size:1.1rem;font-weight:700;color:var(--red)">NONE</div></div>' +
          '<div style="flex:1;min-width:120px;padding:.8rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-md);text-align:center"><div style="font-family:var(--mono);font-size:.55rem;letter-spacing:.1em;color:rgba(255,255,255,.4);margin-bottom:.3rem">LP CLAIM</div><div style="font-size:1.1rem;font-weight:700;color:var(--red)">BLOCKED</div></div>' +
        '</div>' +
      '</div>';
    }

    if (!s.blocked && key === "success") {
      html += '<div style="margin-top:1.5rem;padding:1.5rem;background:var(--navy);color:#fff;border-radius:var(--radius-lg);position:relative;overflow:hidden">' +
        '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--green)"></div>' +
        '<div style="font-family:var(--mono);font-size:.65rem;letter-spacing:.15em;color:rgba(255,255,255,.5);margin-bottom:1rem">PROTOCOL DECISION</div>' +
        '<div style="display:flex;align-items:center;gap:.8rem;margin-bottom:1rem"><div style="width:32px;height:32px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:700">✓</div><div style="font-size:1.1rem;font-weight:700;color:var(--green)">VERIFIED — SETTLED</div></div>' +
        '<div style="display:flex;gap:1rem;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:120px;padding:.8rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-md);text-align:center"><div style="font-family:var(--mono);font-size:.55rem;letter-spacing:.1em;color:rgba(255,255,255,.4);margin-bottom:.3rem">AUTHORIZED</div><div style="font-size:1.1rem;font-weight:700;color:var(--gold)">$0.42</div></div>' +
          '<div style="flex:1;min-width:120px;padding:.8rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-md);text-align:center"><div style="font-family:var(--mono);font-size:.55rem;letter-spacing:.1em;color:rgba(255,255,255,.4);margin-bottom:.3rem">SETTLED</div><div style="font-size:1.1rem;font-weight:700;color:var(--green)">$0.31</div></div>' +
          '<div style="flex:1;min-width:120px;padding:.8rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-md);text-align:center"><div style="font-family:var(--mono);font-size:.55rem;letter-spacing:.1em;color:rgba(255,255,255,.4);margin-bottom:.3rem">UNUSED</div><div style="font-size:1.1rem;font-weight:700;color:var(--text-dim)">$0.11</div></div>' +
        '</div>' +
      '</div>';
    }

    html += '</div>';
    scene.innerHTML = html;
  }

  function renderSettings(el) {
    el.innerHTML =
      '<div class="page-header"><div class="page-header__label">CONFIGURATION</div><h1 class="page-header__title">Settings</h1></div>' +
      '<div class="settings-grid">' +
        '<div class="settings-section"><div class="settings-section__title">Buyer Identity</div>' +
          '<div class="settings-row"><span class="settings-row__label">Name</span><span class="settings-row__value">' + BUYER.name + '</span></div>' +
          '<div class="settings-row"><span class="settings-row__label">ERC-8004</span><span class="settings-row__value" style="color:var(--green)">' + BUYER.id + '</span></div>' +
          '<div class="settings-row"><span class="settings-row__label">Network</span><span class="settings-row__value">' + BUYER.network + '</span></div>' +
        '</div>' +
        '<div class="settings-section"><div class="settings-section__title">Obligation Rules</div>' +
          '<div class="settings-row"><span class="settings-row__label">Max obligation value</span><input class="settings-input" type="text" value="5.00 USDC"></div>' +
          '<div class="settings-row"><span class="settings-row__label">Default expiry</span><input class="settings-input" type="text" value="60s"></div>' +
          '<div class="settings-row"><span class="settings-row__label">Max advance rate</span><input class="settings-input" type="text" value="70%"></div>' +
          '<div class="settings-row"><span class="settings-row__label">Require ERC-8004</span><input type="checkbox" checked style="accent-color:var(--gold)"></div>' +
          '<div class="settings-row"><span class="settings-row__label">Supplier-bound obligations</span><input type="checkbox" checked style="accent-color:var(--gold)"></div>' +
          '<div class="settings-row"><span class="settings-row__label">Verifier required</span><input type="checkbox" checked style="accent-color:var(--gold)"></div>' +
          '<div class="settings-row"><span class="settings-row__label">One settlement per obligation</span><input type="checkbox" checked style="accent-color:var(--gold)"></div>' +
        '</div>' +
        '<div class="settings-section"><div class="settings-section__title">Network</div>' +
          '<div class="settings-row"><span class="settings-row__label">Chain</span><span class="settings-row__value">Celo Mainnet (42220)</span></div>' +
          '<div class="settings-row"><span class="settings-row__label">RPC</span><span class="settings-row__value" style="color:var(--green)">Connected</span></div>' +
          '<div class="settings-row"><span class="settings-row__label">x402</span><span class="settings-row__value settings-row__value--mono">0x4200...0004</span></div>' +
          '<div class="settings-row"><span class="settings-row__label">ERC-8004</span><span class="settings-row__value settings-row__value--mono">0x7A3F...2B1E</span></div>' +
          '<div class="settings-row"><span class="settings-row__label">ERC-8021</span><span class="settings-row__value settings-row__value--mono">0x1B4E...6D7C</span></div>' +
        '</div>' +
      '</div>';
  }

  function getTime() { const h = new Date().getHours(); return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"; }
  window._nav = function (page) { navigate(page); };

  function init() { setupLoader(); setupCursor(); setupNav(); setupRouting(); }
  function setupLoader() { const l = $("#loader"); if (!l) return; setTimeout(() => { l.classList.add("hidden"); if (getRoute() === "landing") initLanding(); }, 2600); }
  function setupCursor() { if ("ontouchstart" in window) { const c = $("#cursor"); if (c) c.style.display = "none"; return; } const cursor = $("#cursor"); if (!cursor || typeof gsap === "undefined") return; const qx = gsap.quickTo(cursor, "left", { duration: 0.12, ease: "power2.out" }); const qy = gsap.quickTo(cursor, "top", { duration: 0.12, ease: "power2.out" }); document.addEventListener("mousemove", e => { qx(e.clientX); qy(e.clientY); }); const sel = "button, a, .obligation-card, .demo-scenario, .supplier-card, .loop__node, .financing-card"; document.addEventListener("mouseover", e => { if (e.target.closest(sel)) cursor.classList.add("cursor--hover"); }); document.addEventListener("mouseout", e => { if (e.target.closest(sel)) cursor.classList.remove("cursor--hover"); }); }
  function setupNav() { $$('a[href^="#"]').forEach(a => { a.addEventListener("click", e => { const t = document.querySelector(a.getAttribute("href")); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth" }); const mm = $("#mobile-menu"); if (mm) mm.classList.remove("open"); const b = $(".nav__burger"); if (b) b.classList.remove("active"); } }); }); const nav = $("#nav"); if (nav) window.addEventListener("scroll", () => nav.classList.toggle("scrolled", window.scrollY > 50), { passive: true }); const burger = $(".nav__burger"), mm = $("#mobile-menu"); if (burger && mm) burger.addEventListener("click", () => { mm.classList.toggle("open"); burger.classList.toggle("active"); }); $$(".sidebar__link").forEach(l => { l.addEventListener("click", e => { e.preventDefault(); const p = l.dataset.page; if (p) navigate(p); const sb = $("#sidebar"); if (sb) sb.classList.remove("open"); }); }); const toggle = $("#sidebar-toggle"); if (toggle) toggle.addEventListener("click", () => { const sb = $("#sidebar"); if (sb) sb.classList.toggle("open"); }); }
  function setupRouting() { const r = getRoute(); if (r === "landing") { $("#landing").style.display = ""; $("#app").style.display = "none"; } else { $("#landing").style.display = "none"; $("#app").style.display = "flex"; setTimeout(() => initApp(r), 100); } window.addEventListener("popstate", () => { const r = getRoute(); if (r === "landing") { $("#landing").style.display = ""; $("#app").style.display = "none"; initLanding(); } else { $("#landing").style.display = "none"; $("#app").style.display = "flex"; initApp(r); } }); document.addEventListener("click", e => { const sb = $("#sidebar"), tg = $("#sidebar-toggle"); if (sb && sb.classList.contains("open") && !sb.contains(e.target) && !tg?.contains(e.target)) sb.classList.remove("open"); }); }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
