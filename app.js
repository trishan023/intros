/* Intros: spinnable globe, city-level pins, and a person card.
   People come from people.json; only entries with "agreed": true are shown. */
(function (global) {
  "use strict";

  const THEME = {
    texture: "assets/textures/earth-pastel.png",
    radius: 1,
    camLat: 12,
    camLon: 58,
    globeWidthFrac: 0.88,
    fov: 42,
    ambient: [0xfff6ea, 0.85],
    hemisphere: [0xfff5e8, 0xe7c9b0, 0.55],
    directional: [0xfff4e4, 0.55, [-0.4, 0.8, 0.35]],
    fill: [0xe8d5c4, 0.2, [0.6, -0.3, -0.2]],
  };

  function latLonToVec3(lat, lon, r) {
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = ((lon + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.cos(theta) * Math.sin(phi),
      r * Math.cos(phi),
      r * Math.sin(theta) * Math.sin(phi)
    );
  }

  function facingAmount(worldPos, camera) {
    const normal = worldPos.clone().normalize();
    const camDir = camera.position.clone().sub(worldPos).normalize();
    return normal.dot(camDir);
  }

  function loadTexture(url, renderer) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }

  function slug(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /* Read people.json and keep only valid, agreed entries. */
  async function loadPeople(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("people.json: HTTP " + res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.people || [];
    const seen = new Set();
    const out = [];
    for (const p of list) {
      if (!p || p.agreed !== true) continue;
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!p.first_name || !p.city || !isFinite(lat) || !isFinite(lng) ||
          Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        console.warn("Skipping person with missing fields", p);
        continue;
      }
      let id = slug(p.id || p.first_name) || "person";
      while (seen.has(id)) id += "-2";
      seen.add(id);
      out.push({
        id,
        name: String(p.first_name),
        city: String(p.city),
        lat,
        lon: lng,
        line: String(p.one_liner || ""),
        by: String(p.recommended_by || ""),
        avatar: String(p.photo || ""),
      });
    }
    return out;
  }

  function attachOrbit(canvas, camera, opts) {
    const spherical = new THREE.Spherical().setFromVector3(camera.position);
    const pointers = new Map();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pinchStartDist = 0;
    let pinchStartRadius = spherical.radius;

    function apply() {
      spherical.phi = Math.max(0.18, Math.min(Math.PI - 0.18, spherical.phi));
      spherical.radius = Math.max(opts.minR, Math.min(opts.maxR, spherical.radius));
      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 0, 0);
      if (opts.onChange) opts.onChange();
    }

    function fadeHint() {
      const hint = document.getElementById("hint");
      if (hint) hint.classList.add("is-gone");
    }

    function distOfTwo() {
      const pts = [...pointers.values()];
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    // Listen on the globe wrapper so a drag that starts on a pin or chip
    // still spins the globe. A press only becomes a drag after a few px,
    // so a plain tap on a chip or dot still reaches its click handler.
    let downX = 0;
    let downY = 0;
    let suppressClick = false;

    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = false;
        downX = lastX = e.clientX;
        downY = lastY = e.clientY;
        suppressClick = false;
      } else if (pointers.size === 2) {
        dragging = false;
        suppressClick = true;
        pinchStartDist = distOfTwo();
        pinchStartRadius = spherical.radius;
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStartDist > 0) {
        spherical.radius = pinchStartRadius * (pinchStartDist / distOfTwo());
        fadeHint();
        apply();
        return;
      }
      if (pointers.size !== 1) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - downX, e.clientY - downY) < 6) return;
        dragging = true;
        suppressClick = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      spherical.theta -= dx * 0.005;
      spherical.phi -= dy * 0.005;
      fadeHint();
      apply();
    });

    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) dragging = false;
      if (pointers.size === 1) {
        const rem = [...pointers.values()][0];
        dragging = true;
        lastX = rem.x;
        lastY = rem.y;
      }
    }
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    // a drag that ends over a chip or dot must not open a card
    canvas.addEventListener("click", (e) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick = false;
      }
    }, true);

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        spherical.radius *= 1 + e.deltaY * 0.001;
        fadeHint();
        apply();
      },
      { passive: false }
    );

    // iOS Safari: stop page-level pinch/scroll gestures over the globe.
    ["gesturestart", "gesturechange"].forEach((t) =>
      canvas.addEventListener(t, (e) => e.preventDefault(), { passive: false })
    );
  }

  function buildCard(root) {
    root.innerHTML = `
      <button class="card-close" type="button" aria-label="Close">
        <span></span>
      </button>
      <img class="card-photo" alt="" width="88" height="88">
      <div class="card-body">
        <h2 class="card-name"></h2>
        <p class="card-city"></p>
        <p class="card-line"></p>
        <p class="card-by"></p>
      </div>
    `;
    return {
      photo: root.querySelector(".card-photo"),
      name: root.querySelector(".card-name"),
      city: root.querySelector(".card-city"),
      line: root.querySelector(".card-line"),
      by: root.querySelector(".card-by"),
      close: root.querySelector(".card-close"),
    };
  }

  const CHIP_H = 24;          // chip height (px), matches CSS
  const CHIP_HIT_PAD = 10;    // invisible tap padding above/below a chip (24 + 2*10 = 44px)
  const DOT_R = 4.5;          // visual dot radius (9px dot)

  function rectsOverlap(a, b, pad) {
    return !(a.r + pad <= b.l || a.l - pad >= b.r || a.b + pad <= b.t || a.t - pad >= b.b);
  }

  /* Candidate chip slots relative to the dot centre: [left, top, needsLeader].
     The first six follow the approved mockup's order; the rest are extra
     fallbacks so busy areas still avoid overlap. */
  function chipSlots(w, onLeft) {
    const H = CHIP_H;
    const above = -7 - H;
    const s = {
      above: [-w / 2, above, false],
      upLeft: [-w + 6, above, false],
      left: [-w - 8, above, false],
      upRight: [-6, above, false],
      right: [8, above, false],
      below: [-w / 2, 9, false],
      belowLeft: [-w + 6, 9, false],
      belowRight: [-6, 9, false],
      sideLeft: [-w - 12, -H / 2, false],
      sideRight: [12, -H / 2, false],
      above2: [-w / 2, above - H - 8, true],
      below2: [-w / 2, 9 + H + 8, true],
    };
    const order = onLeft
      ? ["above", "upRight", "right", "below", "upLeft", "left", "belowRight", "belowLeft", "sideRight", "sideLeft", "above2", "below2"]
      : ["above", "upLeft", "left", "below", "upRight", "right", "belowLeft", "belowRight", "sideLeft", "sideRight", "above2", "below2"];
    return order.map((k) => [k].concat(s[k]));
  }

  async function init() {
    const theme = THEME;
    const openId = new URLSearchParams(location.search).get("card");

    const canvas = document.getElementById("globe");
    const wrap = document.getElementById("globe-wrap");
    const pinsRoot = document.getElementById("pins");
    const cardRoot = document.getElementById("card");
    const hint = document.getElementById("hint");
    const countEl = document.getElementById("count");

    const people = await loadPeople("people.json");
    countEl.textContent = `${people.length} ${people.length === 1 ? "pin" : "pins"}`;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(theme.fov, 1, 0.1, 20);

    function fittedDistance() {
      const w = Math.max(wrap.clientWidth, 1);
      const h = Math.max(wrap.clientHeight, 1);
      const vFov = (theme.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (w / h));
      const ang = Math.max(0.12, theme.globeWidthFrac * hFov);
      return theme.radius / Math.tan(ang / 2);
    }

    camera.position.copy(latLonToVec3(theme.camLat, theme.camLon, fittedDistance()));
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(theme.ambient[0], theme.ambient[1]));
    scene.add(new THREE.HemisphereLight(theme.hemisphere[0], theme.hemisphere[1], theme.hemisphere[2]));
    const dir = new THREE.DirectionalLight(theme.directional[0], theme.directional[1]);
    dir.position.set(...theme.directional[2]).multiplyScalar(5);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(theme.fill[0], theme.fill[1]);
    fill.position.set(...theme.fill[2]).multiplyScalar(5);
    scene.add(fill);

    function resize() {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }
    resize();

    const tex = await loadTexture(theme.texture, renderer);
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(theme.radius, 64, 64),
      new THREE.MeshBasicMaterial({ map: tex })
    ));

    // Soft oval shadow under the globe
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 48),
      new THREE.MeshBasicMaterial({ color: 0x3a3028, transparent: true, opacity: 0.14, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.05;
    scene.add(shadow);

    const card = buildCard(cardRoot);

    function setCard(person) {
      pinsRoot.querySelectorAll(".pin, .pin-chip").forEach((el) => {
        el.classList.toggle("is-on", !!person && el.dataset.id === person.id);
      });
      if (!person) {
        cardRoot.classList.remove("is-open");
        cardRoot.setAttribute("hidden", "");
        return;
      }
      card.photo.src = person.avatar;
      card.photo.alt = `Portrait of ${person.name}`;
      card.name.textContent = person.name;
      card.city.textContent = person.city;
      card.line.textContent = person.line;
      card.by.textContent = person.by ? `Recommended by ${person.by}` : "";
      cardRoot.removeAttribute("hidden");
      cardRoot.classList.add("is-open");
      if (hint) hint.classList.add("is-gone");
    }

    card.close.addEventListener("click", () => setCard(null));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setCard(null);
    });

    people.forEach((person) => {
      const open = (e) => {
        e.stopPropagation();
        setCard(person);
      };
      // Dot: a 44px button centred exactly on the city.
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pin";
      el.dataset.id = person.id;
      el.setAttribute("aria-label", `${person.name} in ${person.city}`);
      el.innerHTML = '<span class="pin-dot" aria-hidden="true"></span><span class="pin-leader" aria-hidden="true"></span>';
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setCard(nearestDot(e, person));
      });
      // Chip: face + first name. Its own element so chips always sit above dot targets.
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "pin-chip";
      chip.dataset.id = person.id;
      chip.tabIndex = -1;
      chip.setAttribute("aria-hidden", "true");
      const face = document.createElement("img");
      face.className = "pin-face";
      face.alt = "";
      face.width = 36;
      face.height = 36;
      face.decoding = "async";
      face.src = person.avatar;
      const name = document.createElement("span");
      name.className = "pin-name";
      name.textContent = person.name;
      chip.append(face, name);
      chip.addEventListener("click", open);
      face.addEventListener("load", () => { person.chipW = 0; });
      pinsRoot.append(el, chip);
      person.el = el;
      person.chip = chip;
      person.chipW = 0;
      person.world = latLonToVec3(person.lat, person.lon, theme.radius * 1.02);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => people.forEach((p) => { p.chipW = 0; }));
    }

    // Dot targets are 44px, so close cities overlap; open the dot nearest the tap.
    function nearestDot(e, fallback) {
      if (!e.clientX && !e.clientY) return fallback; // keyboard activation
      const wr = wrap.getBoundingClientRect();
      const px = e.clientX - wr.left;
      const py = e.clientY - wr.top;
      let best = fallback;
      let bestD = Infinity;
      for (const p of people) {
        if (!p.screen || p.screen.vis < 0.2) continue;
        const d = Math.hypot(p.screen.x - px, p.screen.y - py);
        if (d < bestD) { bestD = d; best = p; }
      }
      return bestD <= 24 ? best : fallback;
    }

    function chipWidth(person) {
      if (!person.chipW) {
        person.chip.classList.remove("is-hidden");
        person.chipW = person.chip.offsetWidth || 60;
      }
      return person.chipW;
    }

    /* Place chips without overlapping each other or other dots. Dots never move. */
    function layoutChips(items, w, h) {
      const placed = [];
      const dots = items.map((it) => ({
        id: it.person.id,
        l: it.x - DOT_R, r: it.x + DOT_R, t: it.y - DOT_R, b: it.y + DOT_R,
      }));
      const order = items.filter((it) => it.showChip).sort((a, b) => b.dot - a.dot);
      for (const it of order) {
        const cw = chipWidth(it.person);
        const onLeft = it.x < w * 0.42;
        let chosen = null;
        for (const [slot, dx, dy, leader] of chipSlots(cw, onLeft)) {
          const r = { l: it.x + dx, t: it.y + dy, r: it.x + dx + cw, b: it.y + dy + CHIP_H };
          if (r.l < 8 || r.r > w - 8 || r.t < 4 || r.b > h - 8) continue;
          const hit = { l: r.l, r: r.r, t: r.t - CHIP_HIT_PAD, b: r.b + CHIP_HIT_PAD };
          if (placed.some((p) => rectsOverlap(r, p, 4))) continue;
          if (dots.some((d) => d.id !== it.person.id && rectsOverlap(hit, d, 1))) continue;
          chosen = { slot, dx, dy, leader, rect: r };
          break;
        }
        it.chipLayout = chosen;
        if (chosen) placed.push(chosen.rect);
      }
    }

    const _v = new THREE.Vector3();
    function updatePins() {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      camera.updateMatrixWorld();
      const items = [];
      for (const person of people) {
        _v.copy(person.world).project(camera);
        const x = (_v.x * 0.5 + 0.5) * w;
        const y = (-_v.y * 0.5 + 0.5) * h;
        const dot = facingAmount(person.world, camera);
        let vis = 1;
        if (dot < 0.04) vis = 0;
        else if (dot < 0.18) vis = (dot - 0.04) / 0.14;
        if (_v.z > 1) vis = 0;
        const el = person.el;
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        el.style.opacity = String(vis);
        el.style.pointerEvents = vis < 0.2 ? "none" : "auto";
        el.style.zIndex = String(200 + Math.round(dot * 80));
        el.classList.toggle("is-back", dot < 0.08);
        person.screen = { x, y, vis };
        const it = { person, x, y, dot, vis, showChip: vis >= 0.45, chipLayout: null };
        if (vis > 0.15) items.push(it);
        else person.chip.classList.add("is-hidden");
      }
      layoutChips(items, w, h);
      for (const it of items) {
        const { person, chipLayout: c } = it;
        const chip = person.chip;
        const el = person.el;
        if (!c) {
          chip.classList.add("is-hidden");
          el.classList.remove("has-leader");
          continue;
        }
        chip.classList.remove("is-hidden");
        chip.style.transform = `translate(${c.rect.l}px, ${c.rect.t}px)`;
        chip.style.opacity = String(it.vis);
        chip.style.pointerEvents = it.vis < 0.2 ? "none" : "auto";
        chip.style.zIndex = String(400 + Math.round(it.dot * 80));
        chip.classList.toggle("is-back", it.dot < 0.08);
        if (c.leader) {
          // line from the dot to the nearest edge of its chip
          const ex = Math.max(c.rect.l, Math.min(it.x, c.rect.r)) - it.x;
          const ey = (c.rect.t > it.y ? c.rect.t : c.rect.b) - it.y;
          el.style.setProperty("--leader-len", Math.hypot(ex, ey) + "px");
          el.style.setProperty("--leader-rot", -Math.atan2(ex, ey) + "rad");
          el.classList.add("has-leader");
        } else {
          el.classList.remove("has-leader");
        }
      }
      global.__PIN_LAYOUT = items.map((it) => ({
        id: it.person.id, x: it.x, y: it.y, vis: it.vis,
        chip: it.chipLayout ? Object.assign({ slot: it.chipLayout.slot }, it.chipLayout.rect) : null,
      }));
    }

    global.__INTROS = { camera, wrap, people };
    const fit = fittedDistance();
    attachOrbit(wrap, camera, { minR: fit * 0.72, maxR: fit * 1.6, onChange: updatePins });

    let readyFrames = 0;
    function tick() {
      renderer.render(scene, camera);
      updatePins();
      if (readyFrames < 8) {
        readyFrames += 1;
        if (readyFrames === 8) {
          Promise.resolve(document.fonts ? document.fonts.ready : null).then(() => {
            global.__GLOBE_READY = true;
            document.body.classList.add("is-ready");
          });
        }
      }
      requestAnimationFrame(tick);
    }

    global.addEventListener("resize", () => {
      resize();
      const sph = new THREE.Spherical().setFromVector3(camera.position);
      sph.radius = fittedDistance();
      camera.position.setFromSpherical(sph);
      camera.lookAt(0, 0, 0);
      updatePins();
    });

    if (openId) {
      const person = people.find((p) => p.id === openId);
      if (person) setCard(person);
    }

    tick();
    resize();
    updatePins();
  }

  global.IntrosApp = { init };
})(window);
