/* ============================================================
   SPUR CORE — 3D Visual Identity
   Attribution loop, commission flow, economic flywheel
   ============================================================ */
window.SpurCore = (function () {
  "use strict";

  const COLORS = {
    gold: 0xb45309,
    goldLight: 0xd97706,
    navy: 0x1e3a5f,
    white: 0xfffefb,
    warmGray: 0xd6d3d1,
    green: 0x16a34a,
    red: 0xdc2626,
    dim: 0xa8a29e,
  };

  class SpurCoreScene {
    constructor(container, opts = {}) {
      this.container = container;
      this.opts = Object.assign({ size: 200, interactive: true, state: "idle", autoRotate: true }, opts);
      this.mouse = { x: 0, y: 0 };
      this.targetRot = { x: 0, y: 0 };
      this.rings = [];
      this.nodes = [];
      this.routeProgress = { t: 0 };
      this.isAnimating = false;
      this.disposed = false;
      this._init();
    }

    _init() {
      const w = this.container.clientWidth || this.opts.size;
      const h = this.container.clientHeight || this.opts.size;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
      this.camera.position.z = 4.5;
      try {
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      } catch (e) { console.warn("WebGL unavailable"); return; }
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setClearColor(0x000000, 0);
      this.container.appendChild(this.renderer.domElement);

      this._buildCore();
      this._buildNodes();
      this._buildRoutePath();
      this._setupInteraction();
      this._animate();
    }

    _buildCore() {
      this.coreGroup = new THREE.Group();
      this.scene.add(this.coreGroup);

      // Outer shell
      const shellGeo = new THREE.SphereGeometry(1.6, 32, 32);
      const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide });
      this.coreGroup.add(new THREE.Mesh(shellGeo, shellMat));

      // Rings
      const ringCfg = [
        { r: 1.4, t: 0.008, c: COLORS.gold, s: 0.003, ax: "x", tilt: 0.3 },
        { r: 1.3, t: 0.006, c: COLORS.dim, s: -0.002, ax: "y", tilt: 0.5 },
        { r: 1.2, t: 0.01, c: COLORS.gold, s: 0.004, ax: "z", tilt: 0.7 },
        { r: 1.0, t: 0.005, c: COLORS.warmGray, s: -0.003, ax: "x", tilt: 1.0 },
        { r: 0.8, t: 0.008, c: COLORS.gold, s: 0.005, ax: "y", tilt: 0.2 },
      ];
      ringCfg.forEach(cfg => {
        const geo = new THREE.TorusGeometry(cfg.r, cfg.t, 16, 100);
        const mat = new THREE.MeshBasicMaterial({ color: cfg.c, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = cfg.tilt;
        ring.userData = { speed: cfg.s, axis: cfg.ax };
        this.coreGroup.add(ring);
        this.rings.push(ring);
      });

      // Center node
      const cGeo = new THREE.SphereGeometry(0.12, 16, 16);
      const cMat = new THREE.MeshBasicMaterial({ color: COLORS.gold });
      this.centerNode = new THREE.Mesh(cGeo, cMat);
      this.coreGroup.add(this.centerNode);

      // Glow
      const gGeo = new THREE.SphereGeometry(0.2, 16, 16);
      const gMat = new THREE.MeshBasicMaterial({ color: COLORS.gold, transparent: true, opacity: 0.15 });
      this.centerGlow = new THREE.Mesh(gGeo, gMat);
      this.coreGroup.add(this.centerGlow);

      // Particles
      const count = 100;
      const pos = new Float32Array(count * 3);
      const cols = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 1.0 + Math.random() * 0.6;
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);
        const hi = Math.random() > 0.7;
        cols[i * 3] = hi ? 0.706 : 0.659;
        cols[i * 3 + 1] = hi ? 0.325 : 0.635;
        cols[i * 3 + 2] = hi ? 0.035 : 0.635;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      pGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      const pMat = new THREE.PointsMaterial({ size: 0.03, vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
      this.particles = new THREE.Points(pGeo, pMat);
      this.coreGroup.add(this.particles);
    }

    _buildNodes() {
      const nodeData = [
        { name: "MERCHANT", lat: 30, lng: -40, color: COLORS.navy },
        { name: "AGENT", lat: -20, lng: -50, color: COLORS.gold },
        { name: "BUYER", lat: 45, lng: 30, color: COLORS.green },
      ];
      nodeData.forEach(n => {
        const phi = (90 - n.lat) * (Math.PI / 180);
        const theta = (n.lng + 180) * (Math.PI / 180);
        const r = 1.8;
        const geo = new THREE.OctahedronGeometry(0.06, 0);
        const mat = new THREE.MeshBasicMaterial({ color: n.color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
        mesh.userData = { name: n.name, basePos: mesh.position.clone() };
        this.coreGroup.add(mesh);
        this.nodes.push(mesh);
      });
    }

    _buildRoutePath() {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-2, 0, 0), new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(2, 0, 0));
      const pts = curve.getPoints(64);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: COLORS.gold, transparent: true, opacity: 0 });
      this.routePath = new THREE.Line(geo, mat);
      this.routePath.visible = false;
      this.scene.add(this.routePath);
      const dGeo = new THREE.SphereGeometry(0.05, 8, 8);
      const dMat = new THREE.MeshBasicMaterial({ color: COLORS.gold });
      this.routeDot = new THREE.Mesh(dGeo, dMat);
      this.routeDot.visible = false;
      this.scene.add(this.routeDot);
      this.routeCurve = curve;
    }

    _setupInteraction() {
      if (!this.opts.interactive) return;
      this.container.addEventListener("mousemove", e => {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        this.mouse.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      });
    }

    _animate() {
      if (this.disposed) return;
      requestAnimationFrame(() => this._animate());
      const t = Date.now() * 0.001;
      this.rings.forEach(r => { r.rotation[r.userData.axis] += r.userData.speed; });
      if (this.particles) { this.particles.rotation.y += 0.001; this.particles.rotation.x += 0.0005; }
      this.nodes.forEach((n, i) => {
        const b = n.userData.basePos;
        n.position.y = b.y + Math.sin(t * 0.8 + i * 1.5) * 0.05;
        n.rotation.y += 0.02;
      });
      if (this.opts.interactive && this.coreGroup) {
        this.targetRot.x = this.mouse.y * 0.15;
        this.targetRot.y = this.mouse.x * 0.15;
        this.coreGroup.rotation.x += (this.targetRot.x - this.coreGroup.rotation.x) * 0.05;
        this.coreGroup.rotation.y += (this.targetRot.y - this.coreGroup.rotation.y) * 0.05;
      }
      if (this.opts.autoRotate && !this.isAnimating) this.coreGroup.rotation.y += 0.002;
      if (this.centerGlow) {
        const s = 1 + Math.sin(t * 2) * 0.15;
        this.centerGlow.scale.setScalar(s);
        this.centerGlow.material.opacity = 0.1 + Math.sin(t * 2) * 0.05;
      }
      if (this.isAnimating && this.routeDot && this.routeDot.visible) {
        this.routeDot.position.copy(this.routeCurve.getPoint(this.routeProgress.t));
      }
      this.renderer.render(this.scene, this.camera);
    }

    playRouteAnimation(dur) {
      if (this.isAnimating) return;
      this.isAnimating = true;
      const d = dur || 2.5;
      this.routePath.visible = true;
      this.routePath.material.opacity = 0.4;
      this.routeDot.visible = true;
      this.routeProgress.t = 0;
      if (typeof gsap !== "undefined") {
        gsap.to(this.routeProgress, {
          t: 1, duration: d, ease: "power2.inOut",
          onComplete: () => { this.routeDot.visible = false; this.routePath.material.opacity = 0; this.routePath.visible = false; this.isAnimating = false; }
        });
        gsap.delayedCall(d * 0.8, () => this._pulse());
      } else {
        setTimeout(() => { this.routeDot.visible = false; this.routePath.visible = false; this.isAnimating = false; }, d * 1000);
      }
    }

    _pulse() {
      if (typeof gsap === "undefined") return;
      gsap.to(this.centerNode.scale, { x: 2, y: 2, z: 2, duration: 0.3, yoyo: true, repeat: 1, ease: "power2.out" });
      gsap.to(this.centerGlow.scale, { x: 3, y: 3, z: 3, duration: 0.4, yoyo: true, repeat: 1, ease: "power2.out" });
    }

    setState(state) {
      this.opts.state = state;
      switch (state) {
        case "routing": this.rings.forEach(r => { if (typeof gsap !== "undefined") gsap.to(r.material, { opacity: 1, duration: 0.5 }); }); this.centerNode.material.color.setHex(COLORS.gold); break;
        case "success": this.centerNode.material.color.setHex(COLORS.green); this._pulse(); break;
        case "blocked": this.centerNode.material.color.setHex(COLORS.red); this.rings.forEach(r => { if (typeof gsap !== "undefined") gsap.to(r.material, { opacity: 0.2, duration: 0.5 }); }); break;
        default: this.centerNode.material.color.setHex(COLORS.gold); this.rings.forEach(r => { if (typeof gsap !== "undefined") gsap.to(r.material, { opacity: 0.6, duration: 0.5 }); });
      }
    }

    resize() {
      if (!this.renderer) return;
      const w = this.container.clientWidth, h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    dispose() {
      this.disposed = true;
      if (this.renderer) {
        this.renderer.dispose();
        if (this.renderer.domElement && this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }

  return { SpurCoreScene, COLORS };
})();
