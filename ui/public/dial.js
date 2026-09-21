/* ============================================================
   SPUR — THE DIAL
   One obligation dial as pure line work: sixty hairline ticks,
   five ember detents, a single needle, a ruby pivot. No WebGL,
   no materials, no dust. Precision only.
   ============================================================ */
(function (global) {
  "use strict";

  var DETENTS = [90, 18, -54, -126, 162];

  function tick(a, major) {
    return (
      '<line class="dial__tick' + (major ? " dial__tick--major" : "") +
      '" x1="100" y1="94" x2="100" y2="' + (major ? "88" : "91") +
      '" transform="rotate(' + a + ' 100 100)"/>'
    );
  }

  function ringTicks() {
    var out = "", i;
    for (i = 0; i < 60; i++) out += tick(i * 6, i % 5 === 0);
    return out;
  }

  function detents() {
    var out = "", i, a, x, y;
    for (i = 0; i < 5; i++) {
      a = ((DETENTS[i] - 90) * Math.PI) / 180;
      x = (100 + Math.cos(a) * 64).toFixed(2);
      y = (100 + Math.sin(a) * 64).toFixed(2);
      out +=
        '<circle class="dial__glow" id="dglow-' + i + '" cx="' + x + '" cy="' + y + '" r="10" opacity="0"/>';
      out += '<circle class="dial__detent" cx="' + x + '" cy="' + y + '" r="3"/>';
    }
    return out;
  }

  function Dial(el, opts) {
    this.el = el;
    this.opts = opts || {};
    this.beat = 0;

    el.innerHTML =
      '<svg class="dial" viewBox="0 0 200 200" role="img" aria-label="Obligation dial">' +
        '<circle class="dial__rim" cx="100" cy="100" r="96"/>' +
        '<circle class="dial__rim dial__rim--inner" cx="100" cy="100" r="70"/>' +
        '<g class="dial__ring">' + ringTicks() + '</g>' +
        '<g class="dial__detents">' + detents() + '</g>' +
        '<circle class="dial__hub" cx="100" cy="100" r="22"/>' +
        '<g class="dial__needle">' +
          '<line class="dial__needle-body" x1="100" y1="36" x2="100" y2="114"/>' +
          '<line class="dial__needle-tail" x1="100" y1="114" x2="100" y2="122"/>' +
        '</g>' +
        '<circle class="dial__pivot" cx="100" cy="100" r="4.6"/>' +
      '</svg>';

    if (global.gsap) {
      gsap.set(el.querySelector(".dial__needle"), { rotation: DETENTS[0], transformOrigin: "50% 50%", transformPerspective: 0 });
    } else {
      el.querySelector(".dial__needle").setAttribute("transform", "rotate(" + DETENTS[0] + " 100 100)");
    }
  }

  Dial.prototype._rot = function (target, dur, ease, cb) {
    var el = this.el.querySelector(".dial__needle");
    if (!global.gsap) {
      el.setAttribute("transform", "rotate(" + target + " 100 100)");
      if (cb) cb();
      return;
    }
    gsap.to(el, { rotation: target, duration: dur, ease: ease || "power2.inOut", onComplete: cb, transformOrigin: "50% 50%" });
  };

  Dial.prototype.setBeat = function (i) {
    this.beat = i % 5;
    this._rot(DETENTS[this.beat], 0.9);
  };

  Dial.prototype.spark = function (i) {
    var g = document.getElementById("dglow-" + (i % 5));
    if (!g) return;
    if (!global.gsap) {
      g.setAttribute("opacity", 0.8);
      setTimeout(function () { g.setAttribute("opacity", 0); }, 300);
      return;
    }
    gsap.killTweensOf(g);
    gsap.fromTo(g, { opacity: 0.9, scale: 1 }, { opacity: 0, scale: 1.5, duration: 0.7, ease: "power1.out", transformOrigin: "50% 50%" });
  };

  Dial.prototype.runCycle = function (from, to, dur) {
    var self = this;
    dur = dur || 1.2;
    if (!global.gsap) {
      this._rot(DETENTS[to % 5], 0, "none");
      this.spark(from % 5);
      setTimeout(function () { self.spark(to % 5); }, dur * 1000);
      return;
    }
    this._rot(DETENTS[from % 5], dur * 0.4, "power1.in");
    var needle = this.el.querySelector(".dial__needle");
    gsap.to(needle, {
      rotation: DETENTS[to % 5], duration: dur, delay: dur * 0.4, ease: "power2.inOut",
      onStart: function () { self.spark(from % 5); },
      onComplete: function () { self.spark(to % 5); }
    });
  };

  Dial.prototype.spin = function (dur) {
    var ring = this.el.querySelector(".dial__ring");
    if (!ring) return;
    if (!global.gsap) return;
    gsap.to(ring, { rotation: 360, duration: dur || 90, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
  };

  Dial.prototype.kill = function () {
    if (!global.gsap) return;
    var root = this.el.querySelector(".dial");
    gsap.killTweensOf(root.querySelector(".dial__needle"));
    gsap.killTweensOf(root.querySelector(".dial__ring"));
    gsap.killTweensOf(root.querySelectorAll(".dial__glow"));
  };

  global.ObligationDial = Dial;
})(window);