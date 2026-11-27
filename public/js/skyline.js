/**
 * Living skyline: a full-screen canvas whose weather IS the air quality.
 *
 *  - sky colour, sun/moon visibility and haze follow the live US AQI
 *  - day/night follows the real local time (from the weather feed)
 *  - drifting smog and dust follow the real wind speed and direction
 *  - "what if" choices thin the haze, clean up traffic exhaust and turn vehicles teal
 *
 * Pure drawing code: no network and no DOM besides the canvas it is given.
 */

import { clamp, lerp, seeded } from './mathUtil.js';

/** Largest haze reduction the "what if" scenario can draw. Keep in sync with src/utils/impact.js. */
const MAX_REDUCTION = 0.75;

const hex = (value) => {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

const PALETTE = {
  skyDayClearTop: hex('#2F86D6'),
  skyDayClearBottom: hex('#BFE4F6'),
  skyDaySmogTop: hex('#8F8062'),
  skyDaySmogBottom: hex('#D8C292'),
  skyNightClearTop: hex('#060A26'),
  skyNightClearBottom: hex('#1D2E5C'),
  skyNightSmogTop: hex('#241D1B'),
  skyNightSmogBottom: hex('#6A4D38'),
  hazeDay: hex('#D2BA86'),
  hazeNight: hex('#7A5A41'),
  farDay: hex('#8398AB'),
  midDay: hex('#5F748A'),
  nearDay: hex('#33475C'),
  farNight: hex('#1B2650'),
  midNight: hex('#121A3A'),
  nearNight: hex('#0A1026'),
  sunClear: hex('#FFD36B'),
  sunSmog: hex('#E8683A'),
  window: hex('#FFC857'),
  clean: hex('#2FB7A8'),
};

export class Skyline {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{reducedMotion?: boolean}} [options]
   */
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reducedMotion = reducedMotion;

    this.target = { aqi: 100, daylight: 1, windKmh: 8, windSign: 1, reduction: 0 };
    this.cur = { smog: 0.35, daylight: 1, wind: 14, windSign: 1, reduction: 0 };

    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.scale = 1;
    this.time = 0;
    this.last = 0;
    this.frame = 0;
    this.running = false;
    this.resizeTimer = 0;

    this.puffs = [];
    this.layers = [];
    this.vehicles = [];
    this.temple = null;

    const rand = seeded(7781);
    this.stars = Array.from({ length: 110 }, () => ({
      x: rand(),
      y: rand() * 0.55,
      r: 0.4 + rand() * 1.1,
      phase: rand() * 6.28,
    }));
    this.blobs = Array.from({ length: 18 }, () => ({
      x: rand(),
      y: 0.04 + rand() * 0.62,
      r: 0.12 + rand() * 0.2,
      a: 0.35 + rand() * 0.5,
      speed: 0.4 + rand() * 0.9,
    }));
    this.motes = Array.from({ length: 200 }, () => ({
      x: rand(),
      y: rand(),
      vy: (rand() - 0.5) * 6,
      s: 1 + rand() * 1.6,
    }));
    this.birds = Array.from({ length: 6 }, (_, i) => ({
      offset: rand(),
      y: 0.12 + rand() * 0.16,
      speed: 18 + rand() * 14,
      phase: i * 1.3,
    }));

    this.onResize = () => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.resize(), 120);
    };
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  /**
   * Feed live conditions. Missing values keep their previous state.
   * @param {{aqi?: number, isDay?: boolean|null, windKmh?: number|null, windDeg?: number|null}} env
   */
  setEnvironment({ aqi, isDay, windKmh, windDeg }) {
    if (Number.isFinite(aqi)) this.target.aqi = aqi;
    if (typeof isDay === 'boolean') this.target.daylight = isDay ? 1 : 0;
    if (Number.isFinite(windKmh)) this.target.windKmh = windKmh;
    if (Number.isFinite(windDeg)) {
      this.target.windSign = -Math.sin((windDeg * Math.PI) / 180) >= 0 ? 1 : -1;
    }
    this.afterChange();
  }

  /**
   * How much the "what if" scenario thins the haze (0 to 0.75).
   * @param {number} reduction
   */
  setReduction(reduction) {
    this.target.reduction = clamp(Number(reduction) || 0, 0, MAX_REDUCTION);
    this.afterChange();
  }

  afterChange() {
    if (this.reducedMotion) {
      this.snap();
      this.draw();
    }
  }

  snap() {
    const t = this.target;
    this.cur.smog = this.smogFromAqi(t.aqi);
    this.cur.daylight = t.daylight;
    this.cur.wind = 6 + t.windKmh * 2;
    this.cur.windSign = t.windSign;
    this.cur.reduction = t.reduction;
  }

  smogFromAqi(aqi) {
    return clamp(Math.pow(Math.max(aqi, 0) / 280, 0.85), 0, 1);
  }

  start() {
    if (this.running) return;
    if (this.reducedMotion) {
      this.snap();
      this.draw();
      return;
    }
    this.running = true;
    this.last = performance.now();
    this.frame = requestAnimationFrame((now) => this.loop(now));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
  }

  loop(now) {
    if (!this.running) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.time += dt;
    this.step(dt);
    this.draw();
    this.frame = requestAnimationFrame((next) => this.loop(next));
  }

  step(dt) {
    const t = this.target;
    const c = this.cur;
    const ease = 1 - Math.exp(-dt * 1.8);
    c.smog += (this.smogFromAqi(t.aqi) - c.smog) * ease;
    c.daylight += (t.daylight - c.daylight) * ease;
    c.reduction += (t.reduction - c.reduction) * ease;
    c.wind += (6 + t.windKmh * 2 - c.wind) * ease;
    c.windSign += (t.windSign - c.windSign) * ease;

    const eff = this.effectiveSmog();
    this.stepVehicles(dt, eff);
    this.stepPuffs(dt);
  }

  effectiveSmog() {
    return this.cur.smog * (1 - this.cur.reduction);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = Math.max(320, Math.round(rect.width));
    this.h = Math.max(320, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    // On narrow screens the panels cover the lower viewport, so the whole scene is
    // composed inside the visible band above them (matches .spacer in styles.css).
    const narrow = window.innerWidth < 960;
    this.refH = narrow ? Math.max(this.h * 0.46, 300) : this.h;
    this.scale = clamp(this.refH / 800, 0.7, 1.3);
    this.ground = this.refH * 0.88;
    this.roadH = this.refH * 0.12;
    this.buildCity();
    this.buildTraffic();
    this.draw();
  }

  buildCity() {
    const { w, refH: h, scale: s } = this;
    const rand = seeded(2611);
    // The temple tower gets a clear patch of sky: mid and near buildings leave its footprint free.
    const temple = { x: w * 0.64, base: 96 * s, tiers: 9, tierH: 21 * s, baseH: 38 * s };
    const gapFrom = temple.x - temple.base / 2 - 16 * s;
    const gapTo = temple.x + temple.base / 2 + 16 * s;
    const makeLayer = (minW, maxW, minH, maxH, withWindows, keepGap = false) => {
      const buildings = [];
      let x = -30;
      while (x < w + 60) {
        const bw = (minW + rand() * (maxW - minW)) * s;
        const bh = (minH + rand() * (maxH - minH)) * h;
        const overlapsTemple = keepGap && x + bw > gapFrom && x < gapTo;
        if (overlapsTemple) {
          x += bw + rand() * 8 * s;
          continue;
        }
        const building = { x, w: bw, h: bh, antenna: rand() < 0.2, lit: null, cols: 0, rows: 0 };
        if (withWindows) {
          building.cols = Math.max(1, Math.floor((bw - 8 * s) / (10 * s)));
          building.rows = Math.max(1, Math.floor((bh - 12 * s) / (15 * s)));
          building.lit = Array.from({ length: building.cols * building.rows }, () => rand() < 0.42);
        }
        buildings.push(building);
        x += bw + rand() * 8 * s;
      }
      return buildings;
    };
    this.layers = [
      { key: 'far', haze: 0.62, buildings: makeLayer(30, 62, 0.16, 0.4, false) },
      { key: 'mid', haze: 0.38, buildings: makeLayer(36, 78, 0.2, 0.5, false, true) },
      { key: 'near', haze: 0.14, buildings: makeLayer(46, 104, 0.14, 0.44, true, true) },
    ];
    this.temple = temple;
  }

  buildTraffic() {
    const { w, ground, roadH, scale: s } = this;
    const rand = seeded(913);
    const laneA = ground + roadH * 0.32;
    const laneB = ground + roadH * 0.72;
    this.vehicles = Array.from({ length: 10 }, (_, i) => {
      const pick = rand();
      const kind = pick < 0.5 ? 'car' : pick < 0.78 ? 'bus' : 'bike';
      const size = {
        car: [34 * s, 13 * s],
        bus: [68 * s, 20 * s],
        bike: [15 * s, 10 * s],
      }[kind];
      const dir = i % 2 === 0 ? 1 : -1;
      return {
        kind,
        w: size[0],
        h: size[1],
        x: rand() * w,
        y: dir === 1 ? laneA : laneB,
        speed: (24 + rand() * 46) * dir * s,
        clean: rand(),
      };
    });
    this.puffs = [];
  }

  stepVehicles(dt, eff) {
    const reduction = this.cur.reduction;
    for (const v of this.vehicles) {
      v.x += v.speed * dt;
      if (v.speed > 0 && v.x > this.w + 80) v.x = -80;
      if (v.speed < 0 && v.x < -80) v.x = this.w + 80;

      const isClean = v.clean < (reduction / MAX_REDUCTION) * 0.92;
      if (!isClean && this.puffs.length < 90 && Math.random() < dt * (1.4 + eff * 3)) {
        const tail = v.speed > 0 ? v.x : v.x + v.w;
        this.puffs.push({
          x: tail,
          y: v.y - v.h * 0.2,
          vx: -Math.sign(v.speed) * 8,
          vy: -6 - Math.random() * 6,
          life: 1,
          r: 3 + Math.random() * 3,
        });
      }
    }
  }

  stepPuffs(dt) {
    for (const p of this.puffs) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += dt * 5;
      p.life -= dt * 0.5;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }

  /** Draw one frame. */
  draw() {
    const { ctx, w, h, dpr } = this;
    if (!ctx || !w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const eff = this.effectiveSmog();
    const day = this.cur.daylight;
    const night = 1 - day;

    this.drawSky(eff, day);
    this.drawStars(eff, night);
    this.drawSun(eff, day);
    this.drawMoon(eff, night);
    this.drawBirds(eff, day);

    const haze = mix(PALETTE.hazeNight, PALETTE.hazeDay, day);
    this.drawLayer(
      this.layers[0],
      mix(PALETTE.farNight, PALETTE.farDay, day),
      haze,
      eff,
      false,
      night,
    );
    this.drawClouds(eff, haze, 0.55);
    this.drawLayer(
      this.layers[1],
      mix(PALETTE.midNight, PALETTE.midDay, day),
      haze,
      eff,
      false,
      night,
    );
    this.drawTemple(
      mix(
        mix(PALETTE.midNight, PALETTE.midDay, day),
        mix(PALETTE.nearNight, PALETTE.nearDay, day),
        0.6,
      ),
      haze,
      eff,
    );
    this.drawHazeBand(eff, haze);
    this.drawLayer(
      this.layers[2],
      mix(PALETTE.nearNight, PALETTE.nearDay, day),
      haze,
      eff,
      true,
      night,
    );
    this.drawRoad(day);
    this.drawVehicles(night);
    this.drawPuffs(eff, haze);
    this.drawClouds(eff, haze, 0.3);
    this.drawMotes(eff, haze);
  }

  drawSky(eff, day) {
    const { ctx, w, h } = this;
    const top = mix(
      mix(PALETTE.skyNightClearTop, PALETTE.skyNightSmogTop, eff),
      mix(PALETTE.skyDayClearTop, PALETTE.skyDaySmogTop, eff),
      day,
    );
    const bottom = mix(
      mix(PALETTE.skyNightClearBottom, PALETTE.skyNightSmogBottom, eff),
      mix(PALETTE.skyDayClearBottom, PALETTE.skyDaySmogBottom, eff),
      day,
    );
    const gradient = ctx.createLinearGradient(0, 0, 0, this.ground);
    gradient.addColorStop(0, rgba(top));
    gradient.addColorStop(1, rgba(bottom));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  drawStars(eff, night) {
    const visibility = night * clamp(1 - eff * 1.25, 0, 1);
    if (visibility < 0.02) return;
    const { ctx, w, refH: h } = this;
    ctx.fillStyle = '#FFFFFF';
    for (const star of this.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(this.time * 1.4 + star.phase);
      ctx.globalAlpha = visibility * twinkle;
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h, star.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSun(eff, day) {
    if (day < 0.03) return;
    const { ctx, w, refH: h, scale: s } = this;
    const x = w * 0.72;
    const y = h * 0.27;
    const radius = 38 * s * (1 + eff * 0.45);
    const color = mix(PALETTE.sunClear, PALETTE.sunSmog, clamp(eff * 1.4, 0, 1));
    const visibility = day * (1 - 0.82 * eff);

    const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 5);
    glow.addColorStop(0, rgba(color, 0.42 * day * (0.4 + eff)));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius * 5, y - radius * 5, radius * 10, radius * 10);

    ctx.fillStyle = rgba(color, clamp(visibility, 0.08, 1));
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 6.2832);
    ctx.fill();
  }

  drawMoon(eff, night) {
    if (night < 0.03) return;
    const { ctx, w, refH: h, scale: s } = this;
    const x = w * 0.78;
    const y = h * 0.22;
    const radius = 24 * s;
    const visibility = night * (1 - 0.7 * eff);
    const glow = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius * 4.5);
    glow.addColorStop(0, `rgba(210,222,255,${0.28 * visibility})`);
    glow.addColorStop(1, 'rgba(210,222,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius * 5, y - radius * 5, radius * 10, radius * 10);
    ctx.fillStyle = `rgba(233,238,247,${clamp(visibility, 0.1, 1)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 6.2832);
    ctx.fill();
  }

  drawBirds(eff, day) {
    const visibility = day * clamp(1 - eff / 0.3, 0, 1);
    if (visibility < 0.05) return;
    const { ctx, w, refH: h, scale: s } = this;
    ctx.strokeStyle = `rgba(30,45,60,${0.7 * visibility})`;
    ctx.lineWidth = 1.5;
    for (const bird of this.birds) {
      const x =
        ((((bird.offset * w + this.time * bird.speed) % (w + 80)) + w + 80) % (w + 80)) - 40;
      const y = h * bird.y + Math.sin(this.time * 0.8 + bird.phase) * 8 * s;
      const flap = Math.sin(this.time * 7 + bird.phase) * 5 * s;
      ctx.beginPath();
      ctx.moveTo(x - 8 * s, y + flap * 0.4);
      ctx.quadraticCurveTo(x - 3 * s, y - flap, x, y);
      ctx.quadraticCurveTo(x + 3 * s, y - flap, x + 8 * s, y + flap * 0.4);
      ctx.stroke();
    }
  }

  drawLayer(layer, base, haze, eff, withWindows, night) {
    const { ctx, ground, scale: s } = this;
    const amount = clamp(layer.haze * (0.25 + eff * 0.95), 0, 0.92);
    ctx.fillStyle = rgba(mix(base, haze, amount));
    for (const b of layer.buildings) {
      ctx.fillRect(b.x, ground - b.h, b.w, b.h);
      if (b.antenna) ctx.fillRect(b.x + b.w * 0.5 - 1, ground - b.h - 16 * s, 2, 16 * s);
    }
    if (!withWindows) return;

    ctx.fillStyle = rgba(PALETTE.window, 0.18 + night * 0.72);
    ctx.beginPath();
    for (const b of layer.buildings) {
      for (let row = 0; row < b.rows; row += 1) {
        for (let col = 0; col < b.cols; col += 1) {
          if (!b.lit[row * b.cols + col]) continue;
          ctx.rect(b.x + 5 * s + col * 10 * s, ground - b.h + 8 * s + row * 15 * s, 5 * s, 7 * s);
        }
      }
    }
    ctx.globalAlpha = clamp(1 - eff * 0.35, 0.5, 1) * (night > 0.1 ? 1 : 0.35);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** A stepped temple tower: a nod to the gopurams that rise above South Indian skylines. */
  drawTemple(base, haze, eff) {
    const { ctx, ground, temple } = this;
    if (!temple) return;
    const amount = clamp(0.38 * (0.25 + eff * 0.95), 0, 0.9);
    ctx.fillStyle = rgba(mix(base, haze, amount));
    ctx.fillRect(temple.x - temple.base / 2, ground - temple.baseH, temple.base, temple.baseH);
    for (let i = 0; i < temple.tiers; i += 1) {
      const width = temple.base * (0.88 - i * 0.082);
      const y = ground - temple.baseH - (i + 1) * temple.tierH;
      ctx.fillRect(temple.x - width / 2, y, width, temple.tierH - 2);
    }
    const topY = ground - temple.baseH - temple.tiers * temple.tierH;
    ctx.beginPath();
    ctx.moveTo(temple.x - temple.base * 0.14, topY);
    ctx.lineTo(temple.x, topY - temple.tierH * 1.2);
    ctx.lineTo(temple.x + temple.base * 0.14, topY);
    ctx.closePath();
    ctx.fill();
  }

  drawHazeBand(eff, haze) {
    const { ctx, w, refH: h, ground } = this;
    const gradient = ctx.createLinearGradient(0, ground - h * 0.6, 0, ground);
    gradient.addColorStop(0, rgba(haze, 0));
    gradient.addColorStop(1, rgba(haze, clamp(eff * 0.78, 0, 0.8)));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, ground - h * 0.6, w, h * 0.6);
  }

  drawClouds(eff, haze, strength) {
    if (eff < 0.04) return;
    const { ctx, w, refH: h, ground } = this;
    for (const blob of this.blobs) {
      const travel = this.time * this.cur.wind * blob.speed * this.cur.windSign;
      const x = ((((blob.x * w + travel) % (w * 1.4)) + w * 1.4) % (w * 1.4)) - w * 0.2;
      const y = ground - blob.y * h;
      const radius = blob.r * Math.max(w, h) * (0.7 + eff * 0.6);
      const alpha = eff * blob.a * strength;
      const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, rgba(haze, alpha));
      gradient.addColorStop(1, rgba(haze, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  drawRoad(day) {
    const { ctx, w, h, ground, roadH, scale: s } = this;
    ctx.fillStyle = rgba(mix(hex('#05070F'), hex('#1D2733'), day));
    ctx.fillRect(0, ground, w, h - ground);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    const y = ground + roadH * 0.5;
    for (let x = -((this.time * 20) % (40 * s)); x < w; x += 40 * s) {
      ctx.fillRect(x, y - 1, 20 * s, 2);
    }
  }

  drawVehicles(night) {
    const { ctx } = this;
    const reduction = this.cur.reduction;
    for (const v of this.vehicles) {
      const clean = v.clean < (reduction / MAX_REDUCTION) * 0.92;
      const body = clean ? PALETTE.clean : v.kind === 'bus' ? hex('#B9733A') : hex('#566275');
      ctx.fillStyle = rgba(body, 1);
      this.roundRect(v.x, v.y - v.h, v.w, v.h, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(210,230,245,0.55)';
      ctx.fillRect(v.x + v.w * 0.14, v.y - v.h * 0.82, v.w * 0.62, v.h * 0.34);
      if (night > 0.2) {
        ctx.fillStyle = `rgba(255,230,160,${night})`;
        const head = v.speed > 0 ? v.x + v.w - 3 : v.x;
        ctx.fillRect(head, v.y - v.h * 0.5, 3, 3);
      }
    }
  }

  roundRect(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  drawPuffs(eff, haze) {
    const { ctx } = this;
    for (const p of this.puffs) {
      ctx.fillStyle = rgba(mix(haze, hex('#40372F'), 0.5), p.life * (0.18 + eff * 0.2));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fill();
    }
  }

  drawMotes(eff, haze) {
    if (eff < 0.05) return;
    const { ctx, w, h } = this;
    const count = Math.floor(this.motes.length * clamp(eff * 1.2, 0, 1));
    ctx.fillStyle = rgba(mix(haze, hex('#FFFFFF'), 0.25), 0.2 + eff * 0.25);
    const drift = this.time * this.cur.wind * 0.8 * this.cur.windSign;
    for (let i = 0; i < count; i += 1) {
      const m = this.motes[i];
      const x = (((m.x * w + drift) % w) + w) % w;
      const y = (((m.y * h + this.time * m.vy) % h) + h) % h;
      ctx.fillRect(x, y, m.s, m.s);
    }
  }
}
