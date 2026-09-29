/* Deterministic video player. Every visual is a pure function of time t, so seek(t) + screenshot = a frame. */
(function () {
  const D = window.__DATA;
  const W = D.w, H = D.h, P = H > W; // portrait
  const XF = D.xfade;
  const root = document.documentElement;
  const th = D.theme;
  const set = (k, v) => root.style.setProperty(k, v);
  set("--W", W + "px"); set("--H", H + "px");
  for (const k of ["bg", "bg2", "ink", "muted", "accent", "accent2"]) set("--" + k, th[k]);
  set("--font", `"${th.font}"`); set("--display", `"${th.display || th.font}"`);
  set("--chrome", th.mode === "dark" ? "#1b1c22" : "#eceef2");
  set("--onAccent", lum(th.accent) > 0.45 ? "#111" : "#fff");
  document.body.classList.add(P ? "portrait" : "landscape", th.mode);

  // Fonts are downloaded ahead of time and served locally (see fonts.ts).
  for (const css of D.fontCss || []) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = D.fontsBase + css;
    document.head.appendChild(l);
  }

  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3); // easeOutCubic
  const inout = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const rich = (s) => esc(s).replace(/&lt;a&gt;/g, '<span class="hl">').replace(/&lt;b&gt;/g, '<span class="hl2">').replace(/&lt;\/[ab]&gt;/g, "</span>");
  const el = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  const px = (v) => v + "px";
  const shotById = (id) => D.shots[id];

  /* ---------- devices ---------- */
  function device(parent, shot, box) {
    const s = shotById(shot);
    if (!s) return null;
    const mobile = s.kind === "mobile";
    const d = el("div", "device " + (mobile ? "phone" : "browser"), parent);
    let w = box.w, h = box.h;
    if (mobile) {
      // Fit a phone (aspect of screenshot + bezel) inside the box.
      const ar = s.height / s.width;
      h = Math.min(box.h, box.w * ar + 32);
      w = (h - 32) / ar + 32;
    } else {
      // Browser frame. In portrait, use a taller window and crop the page to fill it.
      const ar = P ? 1.02 : 0.64;
      h = Math.min(box.h, box.w * ar);
      w = Math.min(box.w, h / ar);
    }
    Object.assign(d.style, { width: px(w), height: px(h), left: px(box.x + (box.w - w) / 2), top: px(box.y + (box.h - h) / 2) });
    if (mobile) el("div", "island", d);
    else {
      const bar = el("div", "bar", d);
      el("i", "", bar); el("i", "", bar); el("i", "", bar);
      el("div", "url", bar, esc((s.url || D.url || "").replace(/^https?:\/\//, "").replace(/\/$/, "")));
    }
    const screen = el("div", "screen", d);
    const img = el("img", "", screen);
    img.src = D.assets + s.file;
    const screenW = mobile ? w - 32 : w;
    const screenH = mobile ? h - 32 : h - 54;
    let imgH = (screenW * s.height) / s.width;
    if (!mobile && s.kind !== "fullpage" && imgH < screenH) {
      // Cover: scale the page up to fill the window, keeping the left (content) side in view.
      const imgW = (screenH * s.width) / s.height;
      img.style.width = px(imgW);
      img.style.left = px(-Math.min(imgW - screenW, (imgW - screenW) * 0.15));
      imgH = screenH;
    }
    return { d, img, screenW, screenH, imgH, mobile, full: s.kind === "fullpage" };
  }

  /* Pan/zoom inside a device over the scene. */
  function moveShot(dev, local, dur, scene) {
    if (!dev) return;
    const p = inout(clamp((local - 0.3) / Math.max(1, dur - 0.6)));
    if (dev.full) {
      const travel = Math.max(0, dev.imgH - dev.screenH);
      dev.img.style.transform = `translateY(${-travel * Math.min(1, travel / (dev.screenH * 5) + 0.35) * p}px)`;
      return;
    }
    const f = scene.focus;
    if (f) {
      const s = 1 + (f.scale - 1) * p;
      const ox = f.x * dev.screenW, oy = f.y * Math.min(dev.imgH, dev.screenH);
      dev.img.style.transformOrigin = `${ox}px ${oy}px`;
      dev.img.style.transform = `scale(${s})`;
    } else if (dev.imgH > dev.screenH * 1.05) {
      dev.img.style.transform = `translateY(${-(dev.imgH - dev.screenH) * 0.35 * p}px)`;
    } else {
      dev.img.style.transformOrigin = "50% 30%";
      dev.img.style.transform = `scale(${1 + 0.06 * p})`;
    }
  }

  /* Entrance animation for an element: fade and rise, with a delay. */
  function enter(scene, e, delay, dist = 40, kind = "rise") {
    e.classList.add("a");
    scene.anims.push({ e, delay, dist, kind });
  }

  function textBlock(parent, scene, box, opts = {}) {
    const wrap = el("div", "", parent);
    Object.assign(wrap.style, { position: "absolute", left: px(box.x), top: px(box.y), width: px(box.w), height: px(box.h), display: "flex", flexDirection: "column", justifyContent: opts.justify || "center", alignItems: opts.center ? "center" : "flex-start", textAlign: opts.center ? "center" : "left", gap: px(P ? 34 : 28) });
    let d = 0.15;
    if (scene.kicker) { enter(scene.s, el("div", "kicker", wrap, esc(scene.kicker)), d); d += 0.1; }
    if (scene.headline) {
      const h = el("h1", "", wrap, rich(scene.headline));
      h.style.fontSize = px(opts.size || (P ? 104 : 92));
      enter(scene.s, h, d); d += 0.14;
    }
    if (scene.sub) { const s = el("p", "sub", wrap, rich(scene.sub)); if (P) s.style.fontSize = "44px"; enter(scene.s, s, d); d += 0.12; }
    if (scene.bullets && scene.bullets.length) {
      const ul = el("ul", "bullets", wrap);
      scene.bullets.slice(0, 4).forEach((b, i) => { const li = el("li", "", ul, rich(b)); if (P) li.style.fontSize = "40px"; enter(scene.s, li, d + i * 0.12, 24); });
    }
    return wrap;
  }

  /* ---------- scene layouts ---------- */
  const M = P ? 84 : 120; // outer margin
  function build(sc, i) {
    const node = el("section", "scene", document.getElementById("scenes"));
    const s = { node, anims: [], devices: [] };
    sc.s = s;
    const addDevice = (shot, box, delay = 0.25) => {
      const dev = device(node, shot, box);
      if (dev) { s.devices.push(dev); enter(s, dev.d, delay, P ? 120 : 90, "device"); }
      return dev;
    };
    const t = sc.type;
    if (t === "hook") {
      if (sc.shot) {
        if (P) { textBlock(node, sc, { x: M, y: 150, w: W - 2 * M, h: 560 }, { center: true, size: 118 }); addDevice(sc.shot, { x: 56, y: 740, w: W - 112, h: 900 }); }
        else { textBlock(node, sc, { x: M, y: 0, w: W * 0.46, h: H }, { size: 112 }); addDevice(sc.shot, { x: W * 0.52, y: 90, w: W * 0.44, h: H - 180 }); }
      } else textBlock(node, sc, { x: M, y: 0, w: W - 2 * M, h: H }, { center: true, size: P ? 132 : 140 });
    } else if (t === "feature") {
      if (P) { textBlock(node, sc, { x: M, y: 120, w: W - 2 * M, h: 600 }, { justify: "flex-end", size: 96 }); addDevice(sc.shot, { x: 56, y: 770, w: W - 112, h: 880 }); }
      else {
        const right = i % 2 === 0;
        textBlock(node, sc, { x: right ? M : W * 0.555, y: 0, w: W * 0.38, h: H });
        addDevice(sc.shot, { x: right ? W * 0.5 : M * 0.7, y: 80, w: W * 0.46, h: H - 160 });
      }
    } else if (t === "landing") {
      if (P) { textBlock(node, sc, { x: M, y: 150, w: W - 2 * M, h: 420 }, { center: true, size: 88 }); addDevice(sc.shot, { x: 56, y: 600, w: W - 112, h: 1060 }); }
      else { textBlock(node, sc, { x: M, y: 50, w: W - 2 * M, h: 200 }, { center: true, size: 72 }); addDevice(sc.shot, { x: 260, y: 270, w: W - 520, h: H - 300 }); }
    } else if (t === "grid") {
      const ids = (sc.shots && sc.shots.length ? sc.shots : [sc.shot]).filter(Boolean).slice(0, 3);
      const top = P ? 560 : 300;
      textBlock(node, sc, { x: M, y: P ? 150 : 40, w: W - 2 * M, h: P ? 380 : 230 }, { center: true, size: P ? 92 : 76 });
      const gw = (W - 2 * M) / Math.max(1, ids.length);
      ids.forEach((id, k) => addDevice(id, { x: M + k * gw + 14, y: top, w: gw - 28, h: H - top - (P ? 220 : 60) }, 0.25 + k * 0.14));
    } else if (t === "stat") {
      const wrap = el("div", "", node);
      Object.assign(wrap.style, { position: "absolute", inset: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", textAlign: "center", padding: px(M) });
      const v = el("div", "display hl2", wrap, esc(sc.value || sc.headline));
      v.style.fontSize = px(P ? 260 : 300); v.style.fontWeight = 900;
      enter(s, v, 0.1, 30, "pop");
      if (sc.value && sc.headline) { const h = el("h1", "", wrap, rich(sc.headline)); h.style.fontSize = px(P ? 80 : 72); enter(s, h, 0.3); }
      if (sc.sub) enter(s, el("p", "sub", wrap, rich(sc.sub)), 0.42);
    } else if (t === "steps") {
      textBlock(node, sc, { x: M, y: P ? 180 : 60, w: W - 2 * M, h: P ? 420 : 260 }, { center: true, size: P ? 96 : 80 });
      const steps = (sc.steps || []).slice(0, 3);
      const grid = el("div", "", node);
      Object.assign(grid.style, { position: "absolute", left: px(M), right: px(M), top: px(P ? 700 : 400), display: "grid", gridTemplateColumns: P ? "1fr" : `repeat(${steps.length}, 1fr)`, gap: "36px" });
      steps.forEach((st, k) => {
        const c = el("div", "card", grid);
        el("div", "num", c, String(k + 1));
        const p = el("div", "", c, rich(st)); p.style.fontSize = px(P ? 44 : 38); p.style.fontWeight = 700; p.style.lineHeight = 1.25;
        enter(s, c, 0.3 + k * 0.16, 50);
      });
    } else if (t === "quote") {
      const wrap = el("div", "", node);
      Object.assign(wrap.style, { position: "absolute", inset: "0", display: "flex", flexDirection: "column", justifyContent: "center", padding: px(P ? 110 : 220), gap: "30px" });
      enter(s, el("div", "quote-mark", wrap, "&ldquo;"), 0.05, 20);
      const q = el("div", "display", wrap, rich(sc.headline)); q.style.fontSize = px(P ? 84 : 76); q.style.fontWeight = 700; q.style.lineHeight = 1.15;
      enter(s, q, 0.18);
      if (sc.who) enter(s, el("div", "kicker", wrap, esc(sc.who)), 0.4);
    } else if (t === "end") {
      const wrap = el("div", "", node);
      Object.assign(wrap.style, { position: "absolute", inset: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: px(P ? 44 : 34), textAlign: "center", padding: px(M) });
      const ic = el("div", "icon", wrap);
      const size = P ? 240 : 200;
      Object.assign(ic.style, { width: px(size), height: px(size), fontSize: px(size * 0.5) });
      if (D.icon) { const im = el("img", "", ic); im.src = D.assets + D.icon; } else ic.textContent = (D.name || "?")[0];
      enter(s, ic, 0.05, 30, "pop");
      const h = el("h1", "", wrap, rich(sc.headline || D.name)); h.style.fontSize = px(P ? 120 : 116); enter(s, h, 0.18);
      if (sc.sub) { const p = el("p", "sub", wrap, rich(sc.sub)); if (P) p.style.fontSize = "46px"; enter(s, p, 0.3); }
      if (sc.cta) enter(s, el("div", "cta", wrap, esc(sc.cta)), 0.45, 30, "pop");
    }
    return s;
  }

  D.scenes.forEach(build);

  /* ---------- captions ---------- */
  const cap = document.querySelector("#caption span");
  const chunks = [];
  if (D.captions) {
    for (const sc of D.scenes) {
      const words = (sc.say || "").split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      const per = P ? 5 : 8;
      const groups = [];
      for (let k = 0; k < words.length; k += per) groups.push(words.slice(k, k + per).join(" "));
      const total = groups.reduce((a, g) => a + g.length, 0);
      let t0 = sc.speechStart;
      for (const g of groups) {
        const d = (sc.speech * g.length) / total;
        chunks.push({ t0, t1: t0 + d, text: g });
        t0 += d;
      }
    }
  }

  /* ---------- seek ---------- */
  const glows = [...document.querySelectorAll(".glow")];
  const progress = document.getElementById("progress");
  let visibleKey = "";
  /** Seek, and when a new scene has just become visible, wait for it to paint (large images decode lazily). */
  window.seekPaint = function (t) {
    window.seek(t);
    const key = D.scenes.filter((sc) => sc.s.node.style.visibility === "visible").map((sc) => sc.i).join(",");
    if (key === visibleKey) return true;
    visibleKey = key;
    const imgs = [...document.querySelectorAll("section")].filter((n) => n.style.visibility === "visible").flatMap((n) => [...n.querySelectorAll("img")]);
    return Promise.all(imgs.map((im) => im.decode().catch(() => 0))).then(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))),
    );
  };
  window.seek = function (t) {
    // Background drift.
    glows.forEach((g, k) => {
      const a = t * 0.18 + k * 2.1;
      const x = (k === 0 ? 0.08 : k === 1 ? 0.92 : 0.45) * W + Math.cos(a) * W * 0.08;
      const y = (k === 0 ? 0.12 : k === 1 ? 0.78 : 1.02) * H + Math.sin(a * 1.3) * H * 0.06;
      g.style.transform = `translate(${x}px, ${y}px)`;
    });
    progress.style.width = (100 * clamp(t / D.duration)) + "%";

    D.scenes.forEach((sc, i) => {
      const s = sc.s, local = t - sc.start;
      if (local < -0.01 || local > sc.dur + 0.01) { s.node.style.opacity = 0; s.node.style.visibility = "hidden"; return; }
      s.node.style.visibility = "visible";
      const fin = i === 0 ? 1 : clamp(local / XF);
      const fout = i === D.scenes.length - 1 ? 1 : clamp((sc.dur - local) / XF);
      const o = Math.min(fin, fout);
      const zoom = 1 + 0.03 * (1 - fin) - 0.02 * (1 - fout);
      s.node.style.opacity = o;
      s.node.style.transform = `scale(${zoom})`;
      for (const a of s.anims) {
        const p = ease((local - a.delay) / (a.kind === "device" ? 0.9 : 0.6));
        if (a.kind === "pop") a.e.style.transform = `scale(${0.85 + 0.15 * p})`;
        else if (a.kind === "device") a.e.style.transform = `translateY(${(1 - p) * a.dist}px) perspective(2000px) rotateX(${(1 - p) * 8}deg)`;
        else a.e.style.transform = `translateY(${(1 - p) * a.dist}px)`;
        a.e.style.opacity = clamp(p * 1.4);
      }
      for (const dev of s.devices) moveShot(dev, local, sc.dur, sc);
    });

    if (chunks.length) {
      const c = chunks.find((c) => t >= c.t0 && t < c.t1 + 0.05);
      if (c) { if (cap.textContent !== c.text) cap.textContent = c.text; cap.style.opacity = 1; }
      else cap.style.opacity = 0;
    }
  };

  window.ready = (async () => {
    await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
    await Promise.all([...document.images].map((im) => (im.decode ? im.decode().catch(() => 0) : 0)));
    await document.fonts.ready;
    // Force-load the weights we use so no frame renders with a fallback face.
    await Promise.all([400, 500, 600, 700, 800, 900].flatMap((w) => [th.font, th.display, "Inter"].filter(Boolean).map((f) => document.fonts.load(`${w} 40px "${f}"`).catch(() => 0))));
    window.seek(0);
    return true;
  })();
})();
