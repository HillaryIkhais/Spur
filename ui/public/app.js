/* ============================================================
   SPUR — Obligation Engine · Application
   Router, views, create flow, detail drawer, palette, toasts.
   ============================================================ */
(function () {
  "use strict";
  const gsap = window.gsap;
  const D = window.SPUR_DATA;
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => [...(c || document).querySelectorAll(s)];

  if (!D) { console.error("SPUR: data.js missing"); return; }

  /* ---------------- state ---------------- */
  const state = {
    obligations: D.obligations.map((o) => ({ ...o, beats: o.beats.map((b) => ({ ...b })) })),
    suppliers: D.suppliers.map((s) => ({ ...s })),
    financing: D.financing.map((f) => ({ ...f })),
    view: "overview",
    drawer: null,
  };

  const BEAT_NAME = ["AUTHORIZE", "OBLIGATE", "EXECUTE", "VERIFY", "SETTLE"];
  const nextId = () => {
    const max = state.obligations.reduce((m, o) => Math.max(m, parseInt(o.id.slice(4), 10) || 0), 1042);
    return "OBL-" + (max + 1);
  };

  /* ---------------- helpers ---------------- */
  const money = (n) => Number(n).toFixed(2) + " <small>USDC</small>";
  const num = (n) => Number(n).toFixed(2).replace(/\.00$/, "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function pill(state) {
    const cls = "pill--" + state;
    const label = state.toUpperCase();
    return `<span class="pill ${cls}">${label}</span>`;
  }

  function toast(msg, kind, ms) {
    const t = document.createElement("div");
    t.className = "toast " + (kind === "err" ? "toast--err" : "toast--ok");
    t.innerHTML = `<i></i>${msg}`;
    $("#toasts").appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, ms || 3400);
  }

  /* ---------------- router ---------------- */
  const VIEWS = ["overview", "obligations", "suppliers", "financing", "identity"];
  const TITLES = {
    overview: "Overview", obligations: "Obligations", suppliers: "Suppliers",
    financing: "Financing", identity: "Identity",
  };

  function navigate(view) {
    if (!VIEWS.includes(view)) return;
    state.view = view;
    $$(".side__link").forEach((l) => l.classList.toggle("is-on", l.dataset.nav === view));
    $$(".view").forEach((v) => v.classList.toggle("view--on", v.id === "view-" + view));
    $("#heading").textContent = TITLES[view];
    $("#crumb").textContent = view === "overview"
      ? "WORKSPACE / OBLIGATION ENGINE"
      : "WORKSPACE / OBLIGATION ENGINE / " + view.toUpperCase();
    render(view);
    closeSide();
    window.scrollTo({ top: 0 });
  }

  /* ---------------- grain ---------------- */
  function grain() {
    const cv = $("#grain"), ctx = cv.getContext("2d");
    let w, h;
    const size = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; };
    size();
    const im = ctx.createImageData(w, h), d = im.data;
    (function tick() {
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255 | 0;
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 20;
      }
      ctx.putImageData(im, 0, 0);
      setTimeout(tick, 340);
    })();
    addEventListener("resize", size);
  }

  /* ---------------- counts ---------------- */
  function counts() {
    $("#count-obl").textContent = state.obligations.length;
    $("#count-fin").textContent = state.financing.length;
  }

  /* ---------------- OVERVIEW ---------------- */
  function renderOverview() {
    const obl = state.obligations;
    const settled = obl.filter((o) => o.state === "settled");
    const active = obl.filter((o) => ["executing", "verified", "settled"].includes(o.state));
    const vol = obl.reduce((a, o) => a + Number(o.settled), 0);
    const open = obl.filter((o) => o.state === "executing").length;
    const fin = state.financing.reduce((a, f) => a + Number(f.exposure), 0);

    const el = $("#view-overview");
    el.innerHTML = `
      <div class="view__head">
        <div>
          <div class="view__title">Briefing</div>
          <div class="view__sub">OBLIGATION ENGINE · AGENT #${D.identity.agent} · ${D.identity.chain} ${D.identity.chainId}</div>
        </div>
        <button class="btn btn--ghost mono table__filter only-table" data-navbtn="obligations">View all obligations</button>
      </div>

      <div class="stats">
        <div class="stat"><div class="stat__label">VERIFIED VOLUME</div><div class="stat__value stat__value--hot">${num(vol)}<small> USDC</small></div><div class="stat__delta"><b>VOID</b> on bad work</div></div>
        <div class="stat"><div class="stat__label">ACTIVE OBLIGATIONS</div><div class="stat__value">${active.length}${open ? '<small>  ·  ' + open + ' in-flight</small>' : ""}</div><div class="stat__delta"><b>1</b> executing now</div></div>
        <div class="stat"><div class="stat__label">SETTLED</div><div class="stat__value stat__value--green">${settled.length}</div><div class="stat__delta"><b>0</b> disputes</div></div>
        <div class="stat"><div class="stat__label">FIN. EXPOSURE</div><div class="stat__value">${num(fin)}<small> USDC</small></div><div class="stat__delta"><b>${state.financing.length}</b> lines open</div></div>
      </div>

      <div class="panel">
        <div class="panel__head"><div class="panel__title">PIPELINE · LIVE POSITION OF OBLIGATIONS</div></div>
        <div class="pipe">${pipeline()}</div>
      </div>

      <div class="stats">
        <div class="stat"><div class="stat__label">TAG</div><div class="stat__value" style="font-size:1.05rem;font-family:var(--mono);letter-spacing:.05em">${D.identity.tag}</div></div>
        <div class="stat"><div class="stat__label">REGISTRY</div><div class="stat__value" style="font-size:.78rem;font-family:var(--mono)">${esc(D.identity.registry.slice(0, 18))}…</div></div>
        <div class="stat"><div class="stat__label">REGISTRATION</div><div class="stat__value" style="font-size:1rem;font-family:var(--mono)">${D.identity.txShort}</div></div>
        <div class="stat"><div class="stat__label">STATUS</div><div class="stat__value stat__value--green" style="font-size:1.4rem">${D.identity.status.toUpperCase()}</div></div>
      </div>
    `;
    bindNav($$("[data-navbtn]", el));
    bindOpen(el);
  }

  function laneFor(state) {
    return { expired: 1, executing: 2, verified: 3, settled: 4 }[state] ?? 0;
  }
  function pipeline() {
    const lanes = BEAT_NAME.map((n, i) => {
      const items = state.obligations.filter((o) => laneFor(o.state) === i);
      const on = i === 0 || i <= 3 && items.some((o) => ["executing", "verified"].includes(o.state));
      const nodes = items.map((o) => `
        <div class="pipe__node" data-open="${o.id}">
          <div class="pipe__node-id">${o.id}</div>
          <div class="pipe__node-amt">PAID <b>${num(o.settled)}</b></div>
        </div>`).join("");
      return `
        <div class="pipe__lane">
          <div class="pipe__lane-head ${on ? "on" : ""}"><i></i>${n}<b>${items.length}</b></div>
          ${nodes || `<div class="pipe__comet">—</div>`}
        </div>`;
    }).join("");
    return `<div class="pipe__lanes">${lanes}</div>`;
  }

  /* ---------------- OBLIGATIONS ---------------- */
  function toolbar(name) {
    return `
      <div class="table__toolbar">
        <select class="table__filter" id="filt-${name}">
          <option value="all">ALL STATES</option>
          <option value="settled">SETTLED</option>
          <option value="verified">VERIFIED</option>
          <option value="executing">EXECUTING</option>
          <option value="expired">EXPIRED</option>
        </select>
        <input class="table__filter" id="q-${name}" placeholder="Search…" style="flex:1;min-width:140px">
      </div>`;
  }

  function renderObligations() {
    const el = $("#view-obligations");
    const rows = state.obligations.map((o) => `
      <tr data-open="${o.id}">
        <td class="table__id">${o.id}</td>
        <td>${esc(o.task)}</td>
        <td class="table__num">${esc(o.buyer)}</td>
        <td>${esc(o.recipient)}</td>
        <td class="table__num mono">${o.ceiling} USDC</td>
        <td class="table__amt mono">${o.settled} USDC</td>
        <td class="mono">${o.window}</td>
        <td>${pill(o.state)}</td>
        <td class="table__row-act">
          <button class="btn btn--ghost btn--sm mono" data-open="${o.id}">OPEN</button>
        </td>
      </tr>`).join("");

    el.innerHTML = `
      <div class="view__head">
        <div><div class="view__title">Obligations</div><div class="view__sub">EVERY COMMITMENT IS AN ECONOMIC RIGHT · 5-BEAT LIFE</div></div>
        <button class="btn btn--solid mono" id="new-from-list">New Obligation</button>
      </div>
      <div class="panel">${toolbar("obl")}
        <div style="overflow-x:auto">
          <table class="table"><thead><tr>
            <th>ID</th><th>TASK</th><th>BUYER</th><th>RECIPIENT</th><th>CEILING</th><th>SETTLED</th><th>WINDOW</th><th>STATE</th><th></th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>
      </div>`;

    const q = $("#q-obl"), filt = $("#filt-obl");
    const apply = () => {
      const t = (q.value || "").toLowerCase();
      const s = filt.value;
      $$("tbody tr", el).forEach((tr) => {
        const id = tr.dataset.open;
        const o = state.obligations.find((x) => x.id === id);
        const okState = s === "all" || o.state === s;
        const okText = !t || (o.id + o.task + o.buyer + o.recipient).toLowerCase().includes(t);
        tr.style.display = okState && okText ? "" : "none";
      });
    };
    q.addEventListener("input", apply); filt.addEventListener("change", apply);

    $("#new-from-list").addEventListener("click", openCreate);
    bindOpen(el);
  }

  /* ---------------- SUPPLIERS ---------------- */
  function ring(s) {
    const c = 62, r = 26, circ = 2 * Math.PI * r;
    const dash = (s.fulfilled / 100) * circ;
    return `<div class="supp__ring"><svg width="44" height="44" viewBox="0 0 62 62">
      <circle cx="31" cy="31" r="${r}" fill="none" stroke="rgba(255,243,228,.1)" stroke-width="5"/>
      <circle cx="31" cy="31" r="${r}" fill="none" stroke="${s.fulfilled >= 98 ? "#7FE0A8" : "#FF4D2E"}" stroke-width="5"
        stroke-dasharray="${dash} ${circ}" stroke-linecap="round" transform="rotate(-90 31 31)"/>
    </svg><b>${s.fulfilled}%</b></div>`;
  }

  function renderSuppliers() {
    const el = $("#view-suppliers");
    const cards = state.suppliers.map((s) => `
      <article class="supp">
        <div class="supp__top">
          <div><div class="supp__name">${esc(s.name)}</div><div class="supp__id mono">SUPPLIER ${s.id}</div></div>
          ${ring(s)}
        </div>
        <div class="supp__meta">
          <div><span>PRICE</span><b class="mono">${s.price} USDC</b></div>
          <div><span>AVG TIME</span><b class="mono">${s.avg}</b></div>
          <div><span>ORDERS</span><b class="mono">${s.orders}</b></div>
          <div><span>EARNINGS</span><b class="mono supp__earn">${s.earnings} USDC</b></div>
        </div>
        <div class="supp__skills mono">${esc(s.skills.toUpperCase())}</div>
      </article>`).join("");
    el.innerHTML = `
      <div class="view__head">
        <div><div class="view__title">Suppliers</div><div class="view__sub">MACHINES THAT EXECUTE UNDER OBLIGATION · FULFILLMENT, NOT PROMISES</div></div>
      </div>
      <div class="supp-grid">${cards}</div>`;
  }

  /* ---------------- FINANCING ---------------- */
  function renderFinancing() {
    const el = $("#view-financing");
    const rows = state.financing.map((f) => `
      <tr>
        <td class="table__id">${f.id}</td><td class="mono">${f.ob}</td><td>${esc(f.supplier)}</td>
        <td class="table__amt mono">${f.advance} USDC</td><td class="mono">${f.fee} USDC</td>
        <td class="mono">${f.rate}</td><td class="mono">${f.exposure} USDC</td><td>${pill(f.state === "active" ? "executing" : "settled")}</td>
      </tr>`).join("");
    const exp = state.financing.reduce((a, f) => a + Number(f.exposure), 0);
    const adv = state.financing.reduce((a, f) => a + Number(f.advance), 0);

    el.innerHTML = `
      <div class="view__head">
        <div><div class="view__title">Financing</div><div class="view__sub">OBLIGATION-BACKED LIQUIDITY · ADVANCE BEFORE SETTLEMENT</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat__label">TOTAL ADVANCED</div><div class="stat__value stat__value--hot">${num(adv)}<small> USDC</small></div></div>
        <div class="stat"><div class="stat__label">EXPOSURE</div><div class="stat__value">${num(exp)}<small> USDC</small></div></div>
        <div class="stat"><div class="stat__label">LINES</div><div class="stat__value">${state.financing.length}</div></div>
        <div class="stat"><div class="stat__label">AVG FEE</div><div class="stat__value" style="font-size:1.5rem">0.70%</div></div>
      </div>
      <div class="panel">
        <div class="panel__head"><div class="panel__title">FINANCING LINES</div></div>
        <div style="overflow-x:auto">
          <table class="table"><thead><tr>
            <th>FIN</th><th>OBLIGATION</th><th>SUPPLIER</th><th>ADVANCE</th><th>FEE</th><th>RATE</th><th>EXPOSURE</th><th>STATE</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>
      </div>`;
  }

  /* ---------------- IDENTITY ---------------- */
  function renderIdentity() {
    const el = $("#view-identity");
    const id = D.identity;
    el.innerHTML = `
      <div class="view__head">
        <div><div class="view__title">Identity</div><div class="view__sub">ON-CHAIN REGISTRATION · ERC-8004 · ATTRIBUTED FROM FIRST STRIKE</div></div>
      </div>
      <div class="id-grid">
        <div class="id-seal panel">
          <div class="id-seal__inner">
            <div class="id-seal__ring"><div class="id-seal__num">${id.agent}</div></div>
            <div class="id-seal__cap mono">AGENT</div>
          </div>
        </div>
        <div class="panel" style="padding:0 1.4rem">
          <div class="panel__head" style="border-bottom:1px solid var(--line-2)">
            <div class="panel__title">REGISTRATION RECORD</div>
            <span class="pill pill--active" style="color:var(--green);border-color:rgba(127,224,168,.4)">${id.status.toUpperCase()}</span>
          </div>
          <div class="id-panel__rows">
            <div class="id-row"><span>CHAIN / ID</span><b>${id.chain} · ${id.chainId}</b></div>
            <div class="id-row"><span>WALLET</span><b class="mono">${id.wallet}</b></div>
            <div class="id-row"><span>ATTRIBUTION</span><b class="mono" style="color:var(--ember)">${id.tag}</b></div>
            <div class="id-row"><span>REGISTRATION TX</span><b class="mono">${id.tx}</b></div>
            <div class="id-row"><span>REGISTRY</span><b class="mono" style="font-size:.6rem">${id.registry}</b></div>
            <div class="id-row"><span>RECORD</span><a class="mono" style="color:var(--ember)" href="${id.erc8004}" target="_blank" rel="noopener">OPEN ERC-8004 RECORD ↗</a></div>
          </div>
          <div class="id-cta">
            <button class="btn btn--ghost btn--sm mono" data-copy>Copy wallet</button>
            <button class="btn btn--ghost btn--sm mono" data-copy-tag>Copy tag</button>
          </div>
        </div>
      </div>`;

    $$("[data-copy]", el).forEach((b) => b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copyTag ? id.tag : id.wallet);
        toast("Copied " + (b.dataset.copyTag ? "attribution tag" : "wallet address"), "ok");
      } catch (_) {}
    }));
  }

  /* ---------------- DRAWER ---------------- */
  function openDrawer(id) {
    const o = state.obligations.find((x) => x.id === id);
    if (!o) return;
    state.drawer = id;
    const b = $("#drawer-body");
    const beats = o.beats.map((bt) => `
      <div class="id-row ${bt.on ? "" : ""}" style="opacity:${bt.on ? 1 : .45}">
        <span>${bt.n}</span><b class="mono">${bt.on ? bt.t : "PENDING"}</b>
      </div>`).join("");
    const canDeliver = o.state === "executing";
    const canSettle = o.state === "verified";
    b.innerHTML = `
      <div style="display:flex;align-items:center;gap:.8rem;padding:1.2rem 0 1rem">
        <div class="table__id" style="font-size:1.2rem">${o.id}</div>${pill(o.state)}
      </div>
      <div class="id-panel__rows" style="border:1px solid var(--line-2);border-radius:10px;padding:0 1.1rem;margin-bottom:1.4rem">
        <div class="id-row"><span>TASK</span><b>${esc(o.task)} — ${esc(o.note)}</b></div>
        <div class="id-row"><span>BUYER</span><b>${esc(o.buyer)} <span class="mono" style="color:var(--ash)">${o.buyerId}</span></b></div>
        <div class="id-row"><span>RECIPIENT</span><b>${esc(o.recipient)} <span class="mono" style="color:var(--ash)">${o.recipientId}</span></b></div>
        <div class="id-row"><span>PROOF</span><b>${o.proof} (independent verifier)</b></div>
      </div>

      <div class="summary" style="margin-bottom:1.4rem">
        <div class="summary__row"><span>CEILING</span><b class="mono">${o.ceiling} USDC</b></div>
        <div class="summary__row"><span>VERIFIED / SETTLED</span><b class="mono" style="color:var(--ember)">${o.settled} USDC</b></div>
        <div class="summary__row"><span>RELEASED</span><b class="mono" style="color:var(--green)">${o.released} USDC</b></div>
        <div class="summary__row"><span>WINDOW / FRESHNESS</span><b class="mono">${o.window} · ${o.freshness}</b></div>
      </div>

      <div class="panel__title" style="padding:0 0 .6rem">LIFE OF THE OBLIGATION</div>
      <div class="id-panel__rows" style="border:1px solid var(--line-2);border-radius:10px;padding:0 1.1rem;margin-bottom:1.4rem">
        ${beats}
      </div>

      <div class="id-cta">
        ${canDeliver ? '<button class="btn btn--solid mono" id="act-deliver">Simulate verified delivery</button>' : ""}
        ${canSettle ? '<button class="btn btn--solid mono" id="act-settle">Settle 0.31 USDC</button>' : ""}
        ${!canSettle && !canDeliver ? `<span class="state" style="padding:1rem">No verified work → no settlement.<br><span class="mono">${o.state === "settled" ? "This obligation is closed." : "The window closed with nothing proven."}</span></span>` : ""}
        <button class="btn btn--ghost mono" id="act-finance">Finance OBL</button>
      </div>`;

    $("#drawer").classList.add("on");
    $("#drawer-scrim").classList.add("on");
    $("#drawer-scrim").addEventListener("click", closeDrawer, { once: true });

    const fin = $("#act-finance");
    if (fin) fin.addEventListener("click", () => finance(o.id));

    const del = $("#act-deliver");
    if (del) del.addEventListener("click", async () => {
      del.disabled = true;
      toast("Delivery recorded for " + o.id + " — verifying…", "ok");
      await sleep(800);
      o.beats[2].on = true; o.beats[2].t = stampNow();
      o.state = "verified"; o.beats[3].on = true; o.beats[3].t = stampNow();
      toast("SPUR-V verified " + o.id + " · 0.31 USDC is now true", "ok", 4200);
      refreshUI();
      openDrawer(o.id);
    });

    const stl = $("#act-settle");
    if (stl) stl.addEventListener("click", async () => {
      stl.disabled = true;
      toast("Settling " + o.id + " via x402…", "ok");
      await sleep(900);
      o.settled = Number(o.ceiling) - Number(o.released);
      o.state = "settled";
      o.beats[3].on = true; o.beats[3].t = stampNow();
      o.beats[4].on = true; o.beats[4].t = stampNow();
      const line = state.financing.find((f) => f.ob === o.id);
      if (line) { line.state = "settled"; counts(); }
      toast(o.id + " settled · " + num(o.settled) + " paid, " + num(o.released) + " released", "ok", 4200);
      refreshUI();
      openDrawer(o.id);
    });
  }

  const stampNow = () => new Date().toTimeString().slice(0, 8);

  function closeDrawer() {
    $("#drawer").classList.remove("on");
    $("#drawer-scrim").classList.remove("on");
    state.drawer = null;
  }

  function finance(id) {
    const o = state.obligations.find((x) => x.id === id);
    if (!o) return;
    if (o.state === "expired") { toast("Cannot finance " + id + " — nothing to back it", "err"); return; }
    const advance = Math.round(Number(o.ceiling) * 0.7 * 100) / 100;
    const line = { id: "FIN-" + String(state.financing.length + 1).padStart(3, "0"), ob: id, supplier: o.recipient, advance, fee: Math.round(advance * 100) / 100 / 99, rate: "0.70%", exposure: o.ceiling, state: "active" };
    state.financing.push(line);
    toast("Financed " + id + " · " + num(advance) + " USDC advanced, obligation is the collateral", "ok", 4200);
    counts();
    if (state.view === "financing") render("financing");
  }

  /* ---------------- CREATE FLOW ---------------- */
  const create = { step: 0, basis: {}, terms: {} };

  function openCreate() {
    create.step = 0;
    $("#modal").classList.add("on");
    $("#modal-scrim").classList.add("on");
    document.body.classList.add("modal-open");
    create.basis = { buyer: D.agents[0].id, recipient: D.suppliers[0].id, task: "FX report", note: "" };
    create.terms = { ceiling: 0.5, window: "60s", freshness: "300s", advance: false };
    renderStep();
  }
  function closeModal() {
    $("#modal").classList.remove("on");
    $("#modal-scrim").classList.remove("on");
    document.body.classList.remove("modal-open");
    disposeForge();
  }
  function renderStep() {
    const steps = [
      { label: "STEP 1 / 3", title: "Basis", body: stepBasis() },
      { label: "STEP 2 / 3", title: "Terms", body: stepTerms() },
      { label: "STEP 3 / 3", title: "Forge", body: stepForge() },
    ];
    const s = steps[create.step];
    $("#modal-step").textContent = s.label;
    $("#modal-title").textContent = s.title;
    $("#modal-body").innerHTML = s.body;
$("#modal-back").style.display = create.step === 0 ? "none" : "";
    $("#modal-next").textContent = create.step === 2 ? "Forge obligation" : "Continue";
    if (create.step === 0) bindStepBasis();
    if (create.step === 1) bindStepTerms();
    if (create.step === 2) bindStepForge();
  }

  function stepBasis() {
    return `
      <div class="form">
        <div class="field">
          <label class="field__label">BUYER</label>
          <select class="select" id="c-buyer">${D.agents.map((a) => `<option value="${a.id}">${esc(a.name)} · ${a.id}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label class="field__label">RECIPIENT (SUPPLIER)</label>
          <select class="select" id="c-recipient">${D.suppliers.map((s) => `<option value="${s.id}">${esc(s.name)} · ${s.id} · ${s.price} USDC</option>`).join("")}</select>
        </div>
        <div class="field">
          <label class="field__label">TASK TYPE</label>
          <select class="select" id="c-task">
            <option>FX report</option><option>Market data</option><option>Compute</option><option>Audit</option><option>News digest</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label">TASK NOTE</label>
          <input class="input" id="c-note" placeholder="e.g. EUR/USD 4h window, freshness < 300s" maxlength="80">
        </div>
      </div>`;
  }
  function bindStepBasis() {
    $("#c-buyer").value = create.basis.buyer;
    $("#c-recipient").value = create.basis.recipient;
    $("#c-task").value = create.basis.task;
    $("#c-note").value = create.basis.note;
    $("#c-buyer").addEventListener("change", (e) => (create.basis.buyer = e.target.value));
    $("#c-recipient").addEventListener("change", (e) => (create.basis.recipient = e.target.value));
    $("#c-task").addEventListener("change", (e) => (create.basis.task = e.target.value));
    $("#c-note").addEventListener("input", (e) => (create.basis.note = e.target.value));
  }

  function stepTerms() {
    return `
      <div class="form">
        <div class="field field--range">
          <label class="field__label" id="c-ceil-label">CEILING · ${create.terms.ceiling.toFixed(2)} USDC</label>
          <div class="range-row">
            <input type="range" id="c-ceil" min="0.05" max="2" step="0.05" value="${create.terms.ceiling}">
            <span class="range-val mono">= ${create.terms.ceiling.toFixed(2)}</span>
          </div>
          <div class="field__hint">Maximum this obligation may move. The ceiling authority, not the payment.</div>
        </div>
        <div class="field">
          <label class="field__label">EXECUTION WINDOW</label>
          <div class="seg">
            ${["60s", "300s", "7d"].map((w) => `<button class="seg__btn ${create.terms.window === w ? "is-on" : ""}" data-w="${w}">${w}</button>`).join("")}
          </div>
        </div>
        <div class="field">
          <label class="field__label">PROOF (SPUR-V)</label>
          <div class="field__hint">Independent verification — schema, freshness ${create.terms.freshness}, source. Bad work settles at zero.</div>
        </div>
        <div class="switch-row">
          <div><div class="field__label">FINANCE READY</div><div class="field__hint">Allow 70% advance against this obligation before settlement.</div></div>
          <label class="switch"><input type="checkbox" id="c-advance"><i></i></label>
        </div>
      </div>`;
  }
  function bindStepTerms() {
    const ceil = $("#c-ceil"), label = $("#c-ceil-label");
    ceil.addEventListener("input", () => {
      create.terms.ceiling = Number(ceil.value);
      $(".range-val").textContent = "= " + create.terms.ceiling.toFixed(2);
      label.textContent = "CEILING · " + create.terms.ceiling.toFixed(2) + " USDC";
    });
    $$(".seg__btn").forEach((b) => b.addEventListener("click", () => {
      create.terms.window = b.dataset.w;
      $$(".seg__btn").forEach((x) => x.classList.toggle("is-on", x === b));
    }));
    $("#c-advance").checked = create.terms.advance;
    $("#c-advance").addEventListener("change", (e) => (create.terms.advance = e.target.checked));
  }

  let forgeDial = null;
  function ensureForge() {
    const host = $("#m-forge");
    if (!host || forgeDial) return;
    if (window.ObligationDial) {
      forgeDial = new window.ObligationDial(host);
      setTimeout(() => { try { forgeDial.runCycle(0, 1, 1.0); forgeDial.runCycle(1, 2, 1.1); } catch (_) {} }, 120);
    }
  }
  function disposeForge() {
    if (forgeDial) { try { forgeDial.kill(); } catch (_) {} forgeDial = null; }
  }

  function stepForge() {
    const b = create.basis, t = create.terms;
    const buyer = D.agents.find((a) => a.id === b.buyer);
    const sup = D.suppliers.find((s) => s.id === b.recipient);
    return `
      <div class="forge-box">
        <div id="m-forge"></div>
        <div>Once forged, <b>${sup.name}</b> is bound to deliver <b>${esc(b.task.toLowerCase())}</b> for <b>${esc(buyer.name)}</b> within <b class="mono">${t.window}</b>, proven by <b>SPUR-V</b>. No custody is taken.</div>
      </div>
      <div class="summary" style="margin-top:1rem">
        <div class="summary__row"><span>BUYER</span><b>${esc(buyer.name)} · ${b.buyer}</b></div>
        <div class="summary__row"><span>RECIPIENT</span><b>${esc(sup.name)} · ${b.recipient}</b></div>
        <div class="summary__row"><span>TASK</span><b>${esc(b.task)}${b.note ? " — " + esc(b.note) : ""}</b></div>
        <div class="summary__row"><span>CEILING</span><b class="mono">${t.ceiling.toFixed(2)} USDC</b></div>
        <div class="summary__row"><span>WINDOW</span><b class="mono">${t.window}</b></div>
        <div class="summary__row"><span>FINANCE READY</span><b>${t.advance ? "YES — 70% advance" : "NO"}</b></div>
      </div>`;
  }
  function bindStepForge() {
    ensureForge();
    $("#modal-next").textContent = "Forge obligation";
  }

  function confirmCreate() {
    const b = create.basis, t = create.terms;
    const id = nextId();
    const sup = D.suppliers.find((s) => s.id === b.recipient);
    const buyer = D.agents.find((a) => a.id === b.buyer);
    const o = {
      id, buyer: buyer.name, buyerId: b.buyer, recipient: sup.name, recipientId: b.recipient,
      task: b.task, note: b.note || "—", ceiling: t.ceiling, settled: 0, released: 0,
      window: t.window, freshness: t.freshness, proof: "SPUR-V", state: "executing",
      beats: [
        { n: "AUTHORIZE", t: stampNow(), on: true }, { n: "OBLIGATE", t: stampNow(), on: true },
        { n: "EXECUTE", t: "DELIVERED", on: true }, { n: "VERIFY", t: "—", on: false }, { n: "SETTLE", t: "—", on: false },
      ],
    };
    state.obligations.unshift(o);
    counts();
    if (t.advance) finance(id);
    toast(id + " forged · " + num(t.ceiling) + " USDC ceiling bound to " + sup.name, "ok", 4600);
    closeModal();
    navigate("obligations");
    setTimeout(() => openDrawer(id), 250);
  }

  /* ---------------- palette ---------------- */
  let palItems = [];
  function palOpen() {
    buildPal("");
  }
  function buildPal(q) {
    const items = [
      { label: "Go to Overview", hint: "view", fn: () => navigate("overview") },
      { label: "Go to Obligations", hint: "view", fn: () => navigate("obligations") },
      { label: "Go to Suppliers", hint: "view", fn: () => navigate("suppliers") },
      { label: "Go to Financing", hint: "view", fn: () => navigate("financing") },
      { label: "Go to Identity", hint: "view", fn: () => navigate("identity") },
      { label: "New obligation", hint: "action", fn: () => { closePal(); openCreate(); } },
      { label: "Demo: settle executing obligation", hint: "action", fn: () => {
        const o = state.obligations.find((x) => x.state === "executing");
        closePal();
        if (o) openDrawer(o.id); else toast("No executing obligation", "err");
      } },
    ];
    palItems = items.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()));
    const list = $("#palette-list");
    if (!palItems.length) { list.innerHTML = '<div class="palette__empty">No matches</div>'; return; }
    list.innerHTML = palItems.map((i, idx) => `
      <button class="palette__item ${idx === 0 ? "is-active" : ""}" data-idx="${idx}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 6 3 12l6 6M15 6l6 6-6 6"/></svg>
        ${i.label}<span class="hint">${i.hint}</span>
      </button>`).join("");
    let cur = 0;
    const act = (n) => {
      cur = (n + palItems.length) % palItems.length;
      $$(".palette__item", list).forEach((b) => b.classList.toggle("is-active", Number(b.dataset.idx) === cur));
    };
    $$(".palette__item", list).forEach((b) => b.addEventListener("mouseenter", () => act(Number(b.dataset.idx))));
    $$(".palette__item", list).forEach((b) => b.addEventListener("click", () => palItems[Number(b.dataset.idx)].fn()));
    palItems._act = act;
  }
  function palKey(e) {
    const list = $("#palette-list");
    if (e.key === "ArrowDown") { palItems._act && palItems._act($$(".palette__item", list).findIndex((b) => b.classList.contains("is-active")) + 1); e.preventDefault(); }
    if (e.key === "ArrowUp") { palItems._act && palItems._act($$(".palette__item", list).findIndex((b) => b.classList.contains("is-active")) - 1); e.preventDefault(); }
    if (e.key === "Enter") { const a = $(".palette__item.is-active", list); a && a.click(); }
  }
  function closePal() {
    $("#palette").classList.remove("on");
    $("#palette-scrim").classList.remove("on");
  }

  /* ---------------- bind global ---------------- */
  function bindOpen(el) {
    $$("[data-open]", el).forEach((n) => n.addEventListener("click", () => openDrawer(n.dataset.open)));
  }
  function bindNav(els) {
    els.forEach((b) => b.addEventListener("click", () => navigate(b.dataset.navbtn)));
  }
  function closeSide() { $("#side").classList.remove("open"); }

  function render(view) {
    ({ overview: renderOverview, obligations: renderObligations, suppliers: renderSuppliers, financing: renderFinancing, identity: renderIdentity }[view])();
  }

  function refreshUI() {
    render(state.view);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- boot ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    grain(); counts();
    gsap && gsap.registerPlugin(window.ScrollTrigger);

    $$(".side__link").forEach((l) => l.addEventListener("click", () => navigate(l.dataset.nav)));
    $("#burger").addEventListener("click", () => $("#side").classList.toggle("open"));
    $("#btn-new").addEventListener("click", openCreate);
    $("#cmd-open").addEventListener("click", () => {
      $("#palette-input").value = ""; buildPal(""); $("#palette").classList.add("on"); $("#palette-scrim").classList.add("on");
      setTimeout(() => $("#palette-input").focus(), 60);
    });
    $("#palette-scrim").addEventListener("click", closePal);
    $("#palette-input").addEventListener("input", (e) => buildPal(e.target.value));
    $("#palette-input").addEventListener("keydown", (e) => { if (e.key === "Escape") closePal(); else palKey(e); });

    $("#btn-new").addEventListener("click", openCreate);
    $("#modal-next").addEventListener("click", () => {
      if (create.step === 2) { confirmCreate(); return; }
      create.step++; renderStep();
    });
    $("#modal-back").addEventListener("click", () => { create.step = Math.max(0, create.step - 1); renderStep(); });
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-scrim").addEventListener("click", closeModal);

    $("#drawer-close").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if ($("#palette").classList.contains("on")) closePal();
        else if ($("#modal").classList.contains("on")) closeModal();
        else if ($("#drawer").classList.contains("on")) closeDrawer();
        else closeSide();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#cmd-open").click(); }
    });

    render("overview");
  });
})();