/**
 * The living 3D city. One WebGL scene sits behind every page; its weather IS the air quality.
 *
 *  - fog, sky colour and the sun/moon follow the live US AQI and the local day/night
 *  - drifting PM2.5 particles follow real wind speed and direction; their number follows the pollution
 *  - "what if" choices thin the haze and turn the traffic teal
 *  - every page has its own camera rig, so moving between pages is a fly-through of the same city
 *
 * Pure rendering: no network, no DOM besides the canvas it creates.
 */
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, seeded } from './mathUtil.js';

/** Largest haze reduction a scenario can draw. Keep in sync with src/utils/impact.js. */
const MAX_REDUCTION = 0.75;

const C = {
  dayClearTop: new THREE.Color('#2f86d6'),
  dayClearBottom: new THREE.Color('#bfe4f6'),
  daySmogTop: new THREE.Color('#8f8062'),
  daySmogBottom: new THREE.Color('#d8c292'),
  nightClearTop: new THREE.Color('#050a18'),
  nightClearBottom: new THREE.Color('#16233f'),
  nightSmogTop: new THREE.Color('#1d1814'),
  nightSmogBottom: new THREE.Color('#40332a'),
  haze: new THREE.Color('#cdb78a'),
  nightHaze: new THREE.Color('#4a3d33'),
  carWarm: new THREE.Color('#ff9a3c'),
  carClean: new THREE.Color('#5fd4c8'),
};

/**
 * Camera rig per page: where the camera sits, what it looks at, how much fog to allow,
 * and a horizontal look offset so the city stays visible beside the content column.
 */
const RIGS = {
  home: { pos: [0, 30, 78], look: [8, 16, -40], fog: 1, drift: 2.2 },
  dashboard: { pos: [-44, 9, 58], look: [10, 18, -40], fog: 0.9, drift: 1.2 },
  near: { pos: [40, 26, 46], look: [0, 14, -40], fog: 0.8, drift: 1.8 },
  planner: { pos: [-60, 16, 30], look: [4, 16, -40], fog: 0.85, drift: 1.6 },
  indoor: { pos: [18, 6, 20], look: [-6, 12, -40], fog: 1.1, drift: 0.9 },
  green: { pos: [-20, 40, 40], look: [10, 4, -40], fog: 0.5, drift: 2 },
  assistant: { pos: [6, 74, 44], look: [0, 0, -34], fog: 0.65, drift: 2.5 },
  lab: { pos: [86, 22, 8], look: [-8, 14, -34], fog: 0.9, drift: 1.8 },
  engineering: { pos: [0, 120, -8], look: [0, 0, -34], fog: 0.3, drift: 0.8 },
  about: { pos: [30, 14, 12], look: [-5, 18, -34], fog: 1, drift: 1.4 },
  notfound: { pos: [0, 5, 30], look: [0, 8, -40], fog: 1.2, drift: 0.6 },
};

function dotTexture(inner = 'rgba(255,255,255,1)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Lit-window facade: returns [colour map, emissive map]. */
function facadeTextures(rand) {
  const w = 32;
  const h = 64;
  const wall = document.createElement('canvas');
  const glow = document.createElement('canvas');
  wall.width = glow.width = w;
  wall.height = glow.height = h;
  const a = wall.getContext('2d');
  const b = glow.getContext('2d');
  a.fillStyle = '#4a5760';
  a.fillRect(0, 0, w, h);
  b.fillStyle = '#000';
  b.fillRect(0, 0, w, h);
  for (let y = 3; y < h - 2; y += 6) {
    for (let x = 3; x < w - 2; x += 7) {
      a.fillStyle = '#2b353d';
      a.fillRect(x, y, 4, 3);
      if (rand() > 0.42) {
        b.fillStyle = rand() > 0.3 ? '#ffd58a' : '#cfe9ff';
        b.fillRect(x, y, 4, 3);
      }
    }
  }
  const make = (canvas) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  return [make(wall), make(glow)];
}

export class World3D {
  /** @returns {boolean} whether this browser can run WebGL. */
  static supported() {
    try {
      const probe = document.createElement('canvas');
      return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
    } catch {
      return false;
    }
  }

  /** @param {HTMLElement} host Element the canvas is inserted into. */
  constructor(host, { reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.rand = seeded(20261119);
    this.env = { aqi: 120, isDay: true, windKmh: 8, windDeg: 270, reduction: 0 };
    // Smoothed values that chase the targets, so changes glide instead of snap.
    this.cur = { smog: 0.5, day: 1, reduction: 0 };
    this.view = 'home';
    this.rig = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fog: 1, drift: 1 };
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.time = 0;
    this.running = false;
    this.last = 0;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'world';
    this.canvas.setAttribute('role', 'img');
    host.prepend(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xd8c292, 0.01);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.5, 600);

    this.buildSky();
    this.buildLights();
    this.buildCity();
    this.buildGopuram();
    this.buildTraffic();
    this.buildSmog();

    this.onResize = () => this.resize();
    this.onMove = (event) => {
      this.pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
      this.pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onMove, { passive: true });
    this.setView('home', { snap: true });
    this.resize();
  }

  /* ---------- scene construction ---------- */

  buildSky() {
    this.skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(450, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader:
          'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, h)), 1.0); }',
      }),
    );
    this.scene.add(dome);

    const starPositions = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i += 1) {
      const a = this.rand() * Math.PI * 2;
      const e = 0.15 + this.rand() * 1.2;
      starPositions.set(
        [Math.cos(a) * Math.cos(e) * 420, Math.sin(e) * 420, Math.sin(a) * Math.cos(e) * 420 - 100],
        i * 3,
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.scene.add(this.stars);

    const glowTex = dotTexture();
    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffb870,
        fog: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.sun.scale.setScalar(90);
    this.sun.position.set(60, 70, -300);
    this.moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xdfe9ff,
        fog: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.moon.scale.setScalar(34);
    this.moon.position.set(-90, 110, -300);
    this.scene.add(this.sun, this.moon);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a4a3a, 1);
    this.sunLight = new THREE.DirectionalLight(0xffe2b0, 1.4);
    this.sunLight.position.set(60, 80, 40);
    this.scene.add(this.hemi, this.sunLight);
  }

  buildCity() {
    const [wall, glow] = facadeTextures(this.rand);
    this.windowMaterial = new THREE.MeshLambertMaterial({
      map: wall,
      emissiveMap: glow,
      emissive: 0xffffff,
      emissiveIntensity: 0,
    });

    const classes = [14, 24, 38, 56];
    const groups = classes.map(() => []);
    const pitch = 7;
    for (let gx = -9; gx <= 9; gx += 1) {
      for (let gz = -16; gz <= -1; gz += 1) {
        if (gx % 4 === 0 || gz % 5 === 0) continue; // streets
        if (Math.abs(gx * pitch + 6) < 9 && Math.abs(gz * pitch + 30) < 9) continue; // temple plot
        const x = gx * pitch + (this.rand() - 0.5) * 1.5;
        const z = gz * pitch + (this.rand() - 0.5) * 1.5;
        const centre = 1 - clamp(Math.hypot(gx, gz + 8) / 14, 0, 1);
        const r = this.rand();
        const cls = clamp(Math.floor(r * 2.4 + centre * 2.2), 0, 3);
        groups[cls].push({
          x,
          z,
          sx: 2.6 + this.rand() * 2.4,
          sz: 2.6 + this.rand() * 2.4,
          tint: 0.78 + this.rand() * 0.3,
        });
      }
    }
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    this.buildings = [];
    groups.forEach((list, index) => {
      const h = classes[index] * (0.8 + this.rand() * 0.15);
      const geo = new THREE.BoxGeometry(1, h, 1);
      geo.translate(0, h / 2, 0);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * (h / 6));
      const mesh = new THREE.InstancedMesh(geo, this.windowMaterial, list.length);
      list.forEach((b, i) => {
        m.compose(
          new THREE.Vector3(b.x, 0, b.z),
          new THREE.Quaternion(),
          new THREE.Vector3(b.sx, 1, b.sz),
        );
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, col.setScalar(b.tint));
      });
      this.scene.add(mesh);
      this.buildings.push(mesh);
    });

    this.groundMaterial = new THREE.MeshLambertMaterial({ color: 0x10171c });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Road centre lines: thin emissive strips along the streets.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x8a949a, fog: true });
    for (let gx = -8; gx <= 8; gx += 4) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 160), lineMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(gx * pitch, 0.05, -50);
      this.scene.add(strip);
    }
    for (let gz = -15; gz <= 0; gz += 5) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(160, 0.25), lineMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.05, gz * pitch);
      this.scene.add(strip);
    }
  }

  /** A stepped temple tower, the one landmark in the skyline. */
  buildGopuram() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xc98f6a });
    const trim = new THREE.MeshLambertMaterial({ color: 0xe8c9a0 });
    const tower = new THREE.Group();
    let y = 0;
    for (let i = 0; i < 9; i += 1) {
      const w = 9 - i * 0.85;
      const h = 2.4 - i * 0.1;
      const tier = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.7), mat);
      tier.position.y = y + h / 2;
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.3, w * 0.7 + 0.5), trim);
      ledge.position.y = y + h;
      tower.add(tier, ledge);
      y += h + 0.3;
    }
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 8), trim);
    crown.position.y = y + 1.3;
    tower.add(crown);
    tower.position.set(-6, 0, -30);
    this.scene.add(tower);
  }

  buildTraffic() {
    const count = 56;
    this.carMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.cars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.2, 0.7, 2.4),
      this.carMaterial,
      count,
    );
    this.cars.frustumCulled = false;
    this.carData = Array.from({ length: count }, (_, i) => {
      const alongZ = i % 2 === 0;
      const lane = alongZ
        ? (Math.floor(this.rand() * 7) - 3) * 28
        : -Math.floor(this.rand() * 4) * 35;
      return {
        alongZ,
        lane: lane + (this.rand() > 0.5 ? 1.3 : -1.3),
        speed: 5 + this.rand() * 7,
        offset: this.rand() * 160,
        dir: this.rand() > 0.5 ? 1 : -1,
      };
    });
    this.scene.add(this.cars);
  }

  buildSmog() {
    this.smogMax = 2600;
    const positions = new Float32Array(this.smogMax * 3);
    this.smogSeed = new Float32Array(this.smogMax);
    for (let i = 0; i < this.smogMax; i += 1) {
      positions.set(
        [(this.rand() - 0.5) * 220, 1 + this.rand() * 46, 30 - this.rand() * 170],
        i * 3,
      );
      this.smogSeed[i] = this.rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.smogMaterial = new THREE.PointsMaterial({
      map: dotTexture(),
      size: 3.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      color: 0xcdb78a,
    });
    this.smog = new THREE.Points(geo, this.smogMaterial);
    this.smog.frustumCulled = false;
    this.scene.add(this.smog);
  }

  /* ---------- public API (same shape as the 2D skyline) ---------- */

  setEnvironment({ aqi, isDay, windKmh, windDeg }) {
    this.env.aqi = Number.isFinite(aqi) ? aqi : this.env.aqi;
    if (isDay !== null && isDay !== undefined) this.env.isDay = Boolean(isDay);
    if (Number.isFinite(windKmh)) this.env.windKmh = windKmh;
    if (Number.isFinite(windDeg)) this.env.windDeg = windDeg;
    this.afterChange();
  }

  setReduction(reduction) {
    this.env.reduction = clamp(reduction || 0, 0, MAX_REDUCTION);
    this.afterChange();
  }

  /** @param {keyof RIGS} name */
  setView(name, { snap = false } = {}) {
    this.view = RIGS[name] ? name : 'home';
    const rig = RIGS[this.view];
    this.target = {
      pos: new THREE.Vector3(...rig.pos),
      look: new THREE.Vector3(...rig.look),
      fog: rig.fog,
      drift: rig.drift,
    };
    if (snap) {
      this.rig.pos.copy(this.target.pos);
      this.rig.look.copy(this.target.look);
      this.rig.fog = rig.fog;
      this.rig.drift = rig.drift;
    }
    this.afterChange();
  }

  afterChange() {
    if (this.reducedMotion || !this.running) this.snapAndDraw();
  }

  snapAndDraw() {
    this.applyEnvironment(true);
    this.rig.pos.copy(this.target.pos);
    this.rig.look.copy(this.target.look);
    this.rig.fog = this.target.fog;
    this.render(0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.reducedMotion) {
      this.snapAndDraw();
      return;
    }
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!document.hidden) this.render(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /* ---------- per-frame ---------- */

  smogFromAqi(aqi) {
    return clamp((aqi - 20) / 280, 0, 1);
  }

  /** Move the smoothed state toward the live targets (or jump there). */
  applyEnvironment(snap) {
    const k = snap ? 1 : 0.04;
    this.cur.smog = lerp(this.cur.smog, this.smogFromAqi(this.env.aqi), k);
    this.cur.day = lerp(this.cur.day, this.env.isDay ? 1 : 0, k);
    this.cur.reduction = lerp(this.cur.reduction, this.env.reduction, snap ? 1 : 0.06);
  }

  render(dt) {
    this.time += dt;
    this.applyEnvironment(dt === 0);

    const eff = this.cur.smog * (1 - this.cur.reduction);
    const day = this.cur.day;
    const night = 1 - day;

    // Sky and fog colours.
    const top = new THREE.Color().lerpColors(C.nightClearTop, C.dayClearTop, day);
    const topSmog = new THREE.Color().lerpColors(C.nightSmogTop, C.daySmogTop, day);
    const bottom = new THREE.Color().lerpColors(C.nightClearBottom, C.dayClearBottom, day);
    const bottomSmog = new THREE.Color().lerpColors(C.nightSmogBottom, C.daySmogBottom, day);
    this.skyUniforms.top.value.copy(top.lerp(topSmog, eff));
    this.skyUniforms.bottom.value.copy(bottom.lerp(bottomSmog, eff));
    this.scene.fog.color.copy(this.skyUniforms.bottom.value);
    this.rig.fog = lerp(this.rig.fog, this.target.fog, dt === 0 ? 1 : 1 - Math.exp(-dt * 1.5));
    this.scene.fog.density = lerp(0.0025, 0.0125, eff) * this.rig.fog;

    // Lights and windows.
    this.hemi.intensity = lerp(0.3, 0.8, day) * lerp(1, 0.8, eff);
    this.hemi.color.set(day > 0.5 ? 0xcfe6ff : 0x4b5f8f);
    this.sunLight.intensity = lerp(0, 1.5, day) * lerp(1, 0.35, eff);
    this.windowMaterial.emissiveIntensity = lerp(0.05, 1.25, night);
    // Morning: sunlit, lighter facades and street. Night: dark towers with lit windows.
    this.windowMaterial.color.setScalar(lerp(1, 2.4, day));
    this.groundMaterial.color
      .setHex(0x10171c)
      .lerp(new THREE.Color(0x4a5560), day * (1 - eff * 0.4));

    // Sun and moon fade into the haze.
    this.sun.material.opacity = day * lerp(1, 0.55, eff);
    this.sun.material.color.set(0xffd9a0).lerp(new THREE.Color(0xff7a3c), eff);
    this.moon.material.opacity = night * lerp(1, 0.4, eff);
    this.stars.material.opacity = night * (1 - eff);

    // Smog particles: count and opacity follow pollution; drift follows the wind.
    const visible = Math.round(this.smogMax * clamp(eff * 1.15 + 0.04, 0, 1));
    this.smog.geometry.setDrawRange(0, visible);
    this.smogMaterial.opacity = lerp(0.1, 0.42, eff);
    this.smogMaterial.color.copy(C.nightHaze).lerp(C.haze, day);
    const rad = (this.env.windDeg * Math.PI) / 180;
    const wind = clamp(this.env.windKmh / 12, 0.4, 3) * dt * 2.2;
    const pos = this.smog.geometry.attributes.position;
    for (let i = 0; i < visible; i += 1) {
      let x = pos.getX(i) - Math.sin(rad) * wind * (0.6 + this.smogSeed[i]);
      let z = pos.getZ(i) + Math.cos(rad) * wind * (0.6 + this.smogSeed[i]);
      if (x > 110) x -= 220;
      if (x < -110) x += 220;
      if (z > 30) z -= 170;
      if (z < -140) z += 170;
      pos.setXYZ(i, x, pos.getY(i) + Math.sin(this.time * 0.4 + i) * 0.004, z);
    }
    pos.needsUpdate = true;

    // Traffic: warm exhaust-orange, turning teal as the scenario gets cleaner.
    this.carMaterial.color
      .copy(C.carWarm)
      .lerp(C.carClean, clamp(this.cur.reduction / MAX_REDUCTION, 0, 1));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    this.carData.forEach((car, i) => {
      const travel = ((((car.offset + this.time * car.speed * car.dir) % 160) + 160) % 160) - 110;
      const position = car.alongZ
        ? new THREE.Vector3(car.lane, 0.4, -travel + 20)
        : new THREE.Vector3(travel, 0.4, car.lane);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.alongZ ? 0 : Math.PI / 2);
      m.compose(position, q, new THREE.Vector3(1, 1, 1));
      this.cars.setMatrixAt(i, m);
    });
    this.cars.instanceMatrix.needsUpdate = true;

    // Camera: glide toward the page's rig, plus slow drift and pointer parallax.
    const glide = dt === 0 ? 1 : 1 - Math.exp(-dt * 1.4);
    this.rig.pos.lerp(this.target.pos, glide);
    this.rig.look.lerp(this.target.look, glide);
    this.pointer.x = lerp(this.pointer.x, this.pointer.tx, 0.05);
    this.pointer.y = lerp(this.pointer.y, this.pointer.ty, 0.05);
    const drift = this.reducedMotion ? 0 : this.target.drift;
    this.camera.position.set(
      this.rig.pos.x + Math.sin(this.time * 0.12) * drift * 3 + this.pointer.x * 2.5,
      this.rig.pos.y + Math.sin(this.time * 0.09) * drift + -this.pointer.y * 1.2,
      this.rig.pos.z + Math.cos(this.time * 0.1) * drift * 2,
    );
    this.camera.lookAt(this.rig.look);

    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 78 : 58;
    this.camera.updateProjectionMatrix();
    if (!this.running || this.reducedMotion) this.render(0);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onMove);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
