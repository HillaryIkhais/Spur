/* ============================================================
   SPUR — LANDING
   Grain, hero reveal, the obligating instrument, loop + proof.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- grain ---------- */
  function grain() {
    const cv = document.getElementById("grain");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let W, H, dots = [];
    function size() {
      W = cv.width = window.innerWidth;
      H = cv.height = window.innerHeight;
    }
    size();
    window.addEventListener("resize", size, { passive: true });
    for (let i = 0; i < 220; i++) {
      dots.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.1, a: 0.05 + Math.random() * 0.2 });
    }
    (function draw() {
      ctx.clearRect(0, 0, W, H);
      for (const d of dots) {
        d.y -= 0.12;
        if (d.y < -2) { d.y = H + 2; d.x = Math.random() * W; }
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,243,228," + d.a + ")";
        ctx.fill();
      }
      requestAnimationFrame(draw);
    })();
  }

  /* ---------- hero: the dial ---------- */
  let dial = null;
  function heroDial() {
    const host = document.getElementById("hero-scene");
    if (!host || !window.ObligationDial) return;
    dial = new window.ObligationDial(host);
    dial.spin(120);
    dial.setBeat(0);

    let step = 0;
    setInterval(function () {
      if (!dial) return;
      step = (step + 1) % 5;
      dial.runCycle(step - 1 < 0 ? 4 : step - 1, step, 1.4);
    }, 3800);
  }

  /* ---------- reveal ---------- */
  function reveals() {
    if (!window.gsap || !window.ScrollTrigger) { return; }
    gsap.registerPlugin(window.ScrollTrigger);

    gsap.utils.toArray(".lhero__line").forEach((l, i) => {
      gsap.fromTo(l, { yPercent: 115 }, { yPercent: 0, duration: 1.15, ease: "power4.out", delay: 0.18 + i * 0.11 });
    });
    gsap.fromTo(".lhero__kicker", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, delay: 0.1, ease: "power2.out" });
    gsap.fromTo(".lhero__lede", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, delay: 0.85, ease: "power2.out" });
    gsap.fromTo(".lhero__actions", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, delay: 1.05, ease: "power2.out" });
    gsap.fromTo(".lhero__viewfinder", { opacity: 0 }, { opacity: 1, duration: 1.4, delay: 0.6, ease: "power2.inOut" });
    gsap.fromTo(".lhero__foot", { opacity: 0 }, { opacity: 1, duration: 1, delay: 1.3 });

    gsap.utils.toArray(".lhow__beat").forEach((b) => {
      gsap.to(b, {
        opacity: 1,
        x: 0,
        duration: 0.9,
        ease: "power2.out",
        scrollTrigger: { trigger: b, start: "top 86%" }
      });
    });

    const seal = gsap.utils.toArray(".lproof__data")[0];
    if (seal) {
      gsap.fromTo(".lproof", { opacity: 0, y: 32 }, {
        opacity: 1, y: 0, duration: 1, ease: "power2.out",
        scrollTrigger: { trigger: ".lproof", start: "top 82%" }
      });
    }
  }

  /* ---------- agent odometer ---------- */
  function odometer() {
    const el = document.getElementById("proof-agent");
    if (!el) return;
    const target = 9858;
    let done = false;
    function run() {
      if (done) return;
      done = true;
      const t0 = performance.now(), dur = 1600;
      (function step(now) {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(e * target)).padStart(4, "0");
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = String(target);
      })(t0);
    }
    const io = new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && run()), { threshold: 0.4 });
    io.observe(el);
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    grain();
    reveals();
    odometer();
    heroDial();
  });
})();