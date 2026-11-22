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

    canvas.addEventListener("pointerdown", (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      } else if (pointers.size === 2) {
        dragging = false;
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
      if (!dragging) return;
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

  const PIN_MARKUP =
    '<span class="pin-visual" aria-hidden="true"><span class="pin-bubble"></span><span class="pin-stem"></span></span>';

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
      pinsRoot.querySelectorAll(".pin").forEach((el) => {
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
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pin";
      el.dataset.id = person.id;
      el.setAttribute("aria-label", `${person.name} in ${person.city}`);
      el.innerHTML = PIN_MARKUP;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setCard(person);
      });
      pinsRoot.appendChild(el);
      person.el = el;
      person.world = latLonToVec3(person.lat, person.lon, theme.radius * 1.02);
    });

    const _v = new THREE.Vector3();
    function updatePins() {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      camera.updateMatrixWorld();
      for (const person of people) {
        _v.copy(person.world).project(camera);
        const x = (_v.x * 0.5 + 0.5) * w;
        const y = (-_v.y * 0.5 + 0.5) * h;
        const dot = facingAmount(person.world, camera);
        const el = person.el;
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        let vis = 1;
        if (dot < 0.04) vis = 0;
        else if (dot < 0.18) vis = (dot - 0.04) / 0.14;
        if (_v.z > 1) vis = 0;
        el.style.opacity = String(vis);
        el.style.pointerEvents = vis < 0.2 ? "none" : "auto";
        el.style.zIndex = String(200 + Math.round(dot * 80));
      }
    }

    const fit = fittedDistance();
    attachOrbit(canvas, camera, { minR: fit * 0.72, maxR: fit * 1.6, onChange: updatePins });

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
