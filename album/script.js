/* =========================================================================
   Scroll-driven 3D art album
   - Pure CSS 3D transforms, one continuous scroll progress value (0 → 1).
   - Every frame is a pure function of progress, so scrolling up replays
     everything in reverse exactly — no event-by-event state.
   - No external libraries: works from file:// and offline.
   ========================================================================= */
(() => {
  "use strict";

  /* ---------- geometry (design px; whole scene is scaled to the viewport) */
  const PW = 440, PH = 580;          // page
  const OX = 10, OY = 9;             // cover overhang (fore-edge, head/tail)
  const CW = PW + OX, CH = PH + OY * 2;
  const CT = 5;                      // board thickness
  const LT = 3;                      // leaf thickness
  const SEGS = 3;                    // segments per leaf (for the page bend)
  const SEGW = PW / SEGS;
  const N = 4;                       // leaves → 4 page turns
  const HINGE = (CT * 2 + N * LT) / 2;   // rotation axis height above the desk
  const R = -1;                      // rotateY sign that lifts pages toward the viewer
  const BEND = 26;                   // max page bend (deg)

  // Distance of each moving part from the hinge, measured along its normal.
  // Mirrors exactly when flipped, so stacks stay ordered on both sides.
  const OFF_COVER = CT + N * LT + CT / 2 - HINGE;
  const offLeaf = (k) => CT + (N - k) * LT + LT / 2 - HINGE;   // k = 1..N

  const $ = (s, el = document) => el.querySelector(s);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const span = (p, [a, b]) => clamp((p - a) / (b - a));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  const D2R = Math.PI / 180;

  const ART_DIR = "./assets/artwork/";
  const artURL = (f) => ART_DIR + encodeURIComponent(f);

  /* ---------- page content ------------------------------------------------ */
  const seeded = (str) => {          // stable pseudo-random per artwork
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1000) / 1000;
  };

  function tapeHTML(a) {
    if (a.tapeType === "corners") {
      return ["tl", "tr", "bl", "br"].map((c) => `<i class="pcorner ${c}"></i>`).join("");
    }
    const rnd = seeded(a.src + a.spread);
    return (a.tape || []).map((pos) => {
      const base = { top: 0, bottom: 0, left: 90, right: 90, tl: -42, tr: 42, bl: 42, br: -42 }[pos] ?? 0;
      const rot = base + (rnd() * 8 - 4);
      const len = 58 + Math.round(rnd() * 22);
      return `<i class="tape ${a.tapeType || "masking"} at-${pos}" style="--r:${rot.toFixed(1)}deg;--len:${len}px"></i>`;
    }).join("");
  }

  function artHTML(a) {
    const curl = a.curl ? `<i class="curl ${a.curl}"></i>` : "";
    return `<figure class="art mount-${a.mount || "print"}${a.curl ? " has-curl curl-" + a.curl : ""}"
      style="left:${a.x}%;top:${a.y}%;width:${a.w}%;--rot:${a.rotation || 0}deg;z-index:${a.z || 1}">
        <div class="art-body"><img src="${artURL(a.src)}" alt="" draggable="false" decoding="async">${curl}</div>
        ${tapeHTML(a)}
      </figure>`;
  }

  function textHTML(t) {
    const pos = t.x != null ? `left:${t.x}%;top:${t.y}%;width:${t.w || 40}%;` : "";
    const rot = t.rotation ? `transform:rotate(${t.rotation}deg);` : "";
    return `<div class="txt ${t.cls || ""}" style="${pos}${rot}">${t.html}</div>`;
  }

  function pageHTML(spread, side) {
    const arts = artworks.filter((a) => a.spread === spread && a.side === side).map(artHTML).join("");
    const txts = texts.filter((t) => t.spread === spread && t.side === side).map(textHTML).join("");
    return `<div class="gutter ${side}"></div>${arts}${txts}<div class="shade ${side}" data-page="${spread}-${side}"></div>`;
  }

  /* ---------- DOM builders ------------------------------------------------ */
  const el = (cls, html = "", style = "") => {
    const d = document.createElement("div");
    d.className = cls;
    if (html) d.innerHTML = html;
    if (style) d.style.cssText = style;
    return d;
  };

  // A leaf is a chain of SEGS hinged segments. Each segment shows its slice of
  // the front (right-hand page) and back (left-hand page) content.
  function buildLeaf(k) {
    const mover = el("mover leaf");
    mover.style.cssText = `width:${PW}px;height:${PH}px;top:0;left:0;`;
    const frontHTML = pageHTML(k, "right");
    const backHTML = pageHTML(k + 1, "left");
    const segs = [];
    let parent = mover;
    for (let i = 0; i < SEGS; i++) {
      const a = i * SEGW, b = a + SEGW;
      const seg = el("seg");
      seg.style.cssText = `width:${SEGW}px;height:${PH}px;left:${i === 0 ? 0 : SEGW}px;top:0;`;
      // faces overlap the next segment by 1px so no hairline seam shows when flat
      const wf = SEGW + (i < SEGS - 1 ? 1 : 0);
      const front = el("face front paper-face", "", `right:auto;width:${wf}px;`);
      front.style.transform = `translateZ(${LT / 2}px)`;
      front.appendChild(el("page right", frontHTML, `width:${PW}px;height:${PH}px;left:${-a}px;`));
      front.appendChild(el("lit"));
      const back = el("face back paper-face", "", `right:auto;width:${wf}px;`);
      back.style.transform = `translateZ(${-LT / 2}px) rotateY(180deg)`;
      back.appendChild(el("page left", backHTML, `width:${PW}px;height:${PH}px;left:${-(PW - a - wf)}px;`));
      back.appendChild(el("lit"));
      const edgeB = el("edge leaf-edge", "", `width:${SEGW}px;height:${LT}px;top:${PH - LT / 2}px;left:0;transform:rotateX(90deg);`);
      const edgeT = el("edge leaf-edge", "", `width:${SEGW}px;height:${LT}px;top:${-LT / 2}px;left:0;transform:rotateX(90deg);`);
      seg.append(front, back, edgeB, edgeT);
      if (i === SEGS - 1) {
        seg.appendChild(el("edge leaf-edge fore", "", `width:${LT}px;height:${PH}px;left:${SEGW - LT / 2}px;top:0;transform:rotateY(90deg);`));
      }
      parent.appendChild(seg);
      segs.push(seg);
      parent = seg;
    }
    return { mover, segs, off: offLeaf(k), lits: [...mover.querySelectorAll(".lit")] };
  }

  // Cover, matched to the album in the film: double gold rule, small
  // filigree corners, the title in the upper third, spine grooves.
  const RL = 50, RR = 30, RT = 28, RB = 28;          // rule insets (left side leaves room for the spine groove)
  const coverArt = () => `
    <svg class="cover-gilt" viewBox="0 0 ${CW} ${CH}" aria-hidden="true">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e9c48a"/><stop offset=".5" stop-color="#d2a468"/><stop offset="1" stop-color="#b98a52"/>
        </linearGradient>
        <g id="orn" fill="none" stroke="url(#gold)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 2 C 9 8, 13 15, 12 22 C 11 28, 5 29, 4 24 C 3 20, 8 19, 9 22"/>
          <path d="M2 2 C 8 9, 15 13, 22 12 C 28 11, 29 5, 24 4 C 20 3, 19 8, 22 9"/>
          <path d="M7 7 C 13 13, 19 19, 27 27" stroke-width="2.4"/>
          <path d="M16 16 C 22 14, 27 17, 26 22 C 25 26, 20 25, 21 22" />
          <path d="M16 16 C 14 22, 17 27, 22 26 C 26 25, 25 20, 22 21" />
          <path d="M27 27 C 33 30, 40 31, 46 29 C 50 27, 50 23, 46 23" stroke-width="1.7"/>
          <path d="M27 27 C 30 33, 31 40, 29 46 C 27 50, 23 50, 23 46" stroke-width="1.7"/>
          <path d="M2 34 C 3 28, 2 22, 1 18 M34 2 C 28 3, 22 2, 18 1" stroke-width="1.5"/>
          <path d="M27 27 l3.5 -3.5 l3.5 3.5 l-3.5 3.5 z M27 27 l-3.5 3.5 l3.5 3.5 l3.5 -3.5 z" fill="url(#gold)" stroke-width=".8"/>
        </g>
      </defs>
      <g class="spine-groove">
        <path d="M14 3 V ${CH - 3}" stroke="rgba(18,2,0,.42)" stroke-width="2.2"/>
        <path d="M16.2 3 V ${CH - 3}" stroke="rgba(255,190,160,.10)" stroke-width="1.2"/>
        <path d="M26 3 V ${CH - 3}" stroke="rgba(18,2,0,.32)" stroke-width="1.6"/>
        <path d="M27.8 3 V ${CH - 3}" stroke="rgba(255,190,160,.08)" stroke-width="1"/>
      </g>
      <rect x="${RL}" y="${RT}" width="${CW - RL - RR}" height="${CH - RT - RB}" fill="none" stroke="url(#gold)" stroke-width="2.4"/>
      <rect x="${RL + 5}" y="${RT + 5}" width="${CW - RL - RR - 10}" height="${CH - RT - RB - 10}" fill="none" stroke="url(#gold)" stroke-width="1"/>
      <use href="#orn" transform="translate(${RL + 8} ${RT + 8})"/>
      <use href="#orn" transform="translate(${CW - RR - 8} ${RT + 8}) scale(-1 1)"/>
      <use href="#orn" transform="translate(${RL + 8} ${CH - RB - 8}) scale(1 -1)"/>
      <use href="#orn" transform="translate(${CW - RR - 8} ${CH - RB - 8}) scale(-1 -1)"/>
    </svg>
    <div class="cover-title" style="left:${RL}px;right:${RR}px">${ALBUM.title}</div>`;

  function buildCover() {
    const mover = el("mover cover");
    mover.style.cssText = `width:${CW}px;height:${CH}px;top:${-OY}px;left:0;`;
    const seg = el("seg");
    seg.style.cssText = `width:${CW}px;height:${CH}px;left:0;top:0;`;
    const front = el("face front leather-face", coverArt());
    front.style.transform = `translateZ(${CT / 2}px)`;
    front.appendChild(el("lit"));
    const back = el("face back leather-face inside");
    back.style.transform = `translateZ(${-CT / 2}px) rotateY(180deg)`;
    const endpaper = el("endpaper page left", pageHTML(1, "left"), `width:${PW}px;height:${PH}px;left:${OX}px;top:${OY}px;`);
    back.append(endpaper, el("lit"));
    const eB = el("edge board-edge", "", `width:${CW}px;height:${CT}px;top:${CH - CT / 2}px;left:0;transform:rotateX(90deg);`);
    const eT = el("edge board-edge", "", `width:${CW}px;height:${CT}px;top:${-CT / 2}px;left:0;transform:rotateX(90deg);`);
    const eF = el("edge board-edge", "", `width:${CT}px;height:${CH}px;left:${CW - CT / 2}px;top:0;transform:rotateY(90deg);`);
    seg.append(front, back, eB, eT, eF);
    mover.appendChild(seg);
    return { mover, segs: [seg], off: OFF_COVER, lits: [...mover.querySelectorAll(".lit")] };
  }

  function buildBackCover() {
    const g = el("board back-board");
    g.style.cssText = `width:${CW}px;height:${CH}px;top:${-OY}px;left:0;transform:translateZ(${CT / 2}px);`;
    const top = el("face leather-face inside");
    top.style.transform = `translateZ(${CT / 2}px)`;
    top.appendChild(el("endpaper page right", pageHTML(N + 1, "right"), `width:${PW}px;height:${PH}px;left:0;top:${OY}px;`));
    const eB = el("edge board-edge", "", `width:${CW}px;height:${CT}px;top:${CH - CT / 2}px;left:0;transform:rotateX(90deg);`);
    const eF = el("edge board-edge", "", `width:${CT}px;height:${CH}px;left:${CW - CT / 2}px;top:0;transform:rotateY(90deg);`);
    const eT = el("edge board-edge", "", `width:${CW}px;height:${CT}px;top:${-CT / 2}px;left:0;transform:rotateX(90deg);`);
    g.append(top, eB, eF, eT);
    return g;
  }

  /* ---------- build scene ------------------------------------------------- */
  const book = $("#book");
  const world = $("#world");
  const stage = $("#stage");

  const shadowWide = el("contact contact-soft", "", `width:${CW * 2 + 60}px;height:${CH + 50}px;left:${-CW - 30}px;top:${-OY - 25}px;`);
  const shadowTight = el("contact contact-tight", "", `width:${CW * 2 + 6}px;height:${CH + 6}px;left:${-CW - 3}px;top:${-OY - 3}px;`);
  book.append(shadowWide, shadowTight);
  book.appendChild(buildBackCover());

  const spine = el("spine", `<i></i><i></i><i></i><i></i>`, `width:${HINGE * 2}px;height:${CH}px;top:${-OY}px;left:0;`);
  book.appendChild(spine);

  const leaves = [];
  for (let k = N; k >= 1; k--) { const L = buildLeaf(k); leaves[k] = L; book.appendChild(L.mover); }
  const cover = buildCover();
  book.appendChild(cover.mover);

  const shadeEls = {};
  book.querySelectorAll(".shade").forEach((s) => (shadeEls[s.dataset.page] ||= []).push(s));

  /* ---------- per-frame state -------------------------------------------- */
  function moverTransform(m, phi, bendDeg) {
    m.mover.style.transform =
      `translate3d(0,0,${HINGE}px) rotateY(${R * phi}deg) translateZ(${m.off}px)`;
    if (m.segs.length > 1) {
      // outer segments lag behind the inner one → the page curves
      const lim = 0.7 * Math.min(phi, 180 - phi);
      const b = clamp(bendDeg, -lim, lim);
      m.segs[1].style.transform = `rotateY(${R * -b * 0.42}deg)`;
      m.segs[2].style.transform = `rotateY(${R * -b * 0.58}deg)`;
    }
  }

  function setLit(m, phi, isCover) {
    const s = Math.sin(phi * D2R);
    const front = (isCover ? 0.30 : 0.42) * s;   // facing away from the lamp as it rises
    const back = (isCover ? 0.22 : 0.30) * s;
    m.lits.forEach((l) => {
      const v = l.parentElement.classList.contains("back") ? back : front;
      l.style.opacity = v.toFixed(3);
    });
  }

  let shadedNow = [];
  function setShade(key, phi, side) {
    const list = shadeEls[key];
    if (!list) return;
    let op = 0, f = 1;
    if (side === "right" && phi < 90) { op = 0.62 * Math.sin(phi * D2R); f = Math.min(1, Math.cos(phi * D2R) + 0.18); }
    if (side === "left" && phi > 90) { const q = 180 - phi; op = 0.55 * Math.sin(q * D2R); f = Math.min(1, Math.cos(q * D2R) + 0.18); }
    list.forEach((s) => { s.style.opacity = op.toFixed(3); s.style.transform = `scaleX(${f.toFixed(3)})`; });
    if (op > 0) shadedNow.push(key);
  }

  let fitScale = 1;
  function fit() {
    const vw = innerWidth, vh = innerHeight;
    const portrait = vw / vh < 0.9;
    const wFit = (vw * (portrait ? 0.98 : 0.72)) / (CW * 2);
    const hFit = (vh * 0.8) / (CH * 0.86);
    fitScale = Math.min(wFit, hFit);
    lastP = -1;
  }

  const navItems = [...document.querySelectorAll(".index-rail a")];
  const railFill = $(".rail-fill");
  const readout = $(".index-readout");
  const roNum = $(".ro-num"), roName = $(".ro-name"), icNow = $(".ic-now");
  navItems.forEach((a) => (a.style.top = `${+a.dataset.p * 100}%`));
  let activeIdx = -1, swapTimer = 0;
  const hint = $(".hint");
  const endHint = $(".end-hint");

  let lastP = -1;
  function render(p) {
    if (Math.abs(p - lastP) < 1e-5) return;
    lastP = p;
    const T = TIMELINE;
    const closing = p >= T.close[0];
    const u = span(p, T.close);

    // angles in degrees (0 = lying on the right, 180 = lying on the left)
    let coverPhi, leafPhi = [];
    if (!closing) {
      coverPhi = 180 * ease(span(p, T.open));
      for (let k = 1; k <= N; k++) leafPhi[k] = 180 * ease(span(p, T.turns[k - 1]));
    } else {
      // the cover lifts the whole text block back over as one body;
      // the top sheet leads by a hair so the stack fans only slightly
      const lead = (d) => 180 * (1 - ease(clamp((u - d) / 0.94)));
      for (let k = 1; k <= N; k++) leafPhi[k] = lead((N - k) * 0.012);
      coverPhi = lead(0.06);
    }

    // movers + bend
    const bendAmt = (phi, dir) => dir * BEND * Math.sin((phi / 180) * Math.PI);
    moverTransform(cover, coverPhi, 0);
    setLit(cover, coverPhi, true);
    for (let k = 1; k <= N; k++) {
      moverTransform(leaves[k], leafPhi[k], bendAmt(leafPhi[k], closing ? -0.12 : 1));
      setLit(leaves[k], leafPhi[k], false);
    }

    // spine folds flat under the gutter as the cover opens
    const open = coverPhi / 180;
    spine.style.transform = `rotateY(${R * (90 + 90 * open)}deg)`;

    // dynamic shadows on the pages beneath the moving sheet
    shadedNow.forEach((key) => setShade(key, 0, "right"));
    shadedNow = [];
    if (!closing) {
      if (coverPhi > 0 && coverPhi < 180) setShade("1-right", coverPhi, "right");
      for (let k = 1; k <= N; k++) {
        const f = leafPhi[k];
        if (f > 0 && f < 180) { setShade(`${k + 1}-right`, f, "right"); setShade(`${k}-left`, f, "left"); }
      }
    } else if (leafPhi[N] < 180) {
      setShade(`${N + 1}-right`, leafPhi[N], "right");
    }

    // book drifts so whatever is visible stays centred (reads as a gentle reframe)
    const centreOpen = closing
      ? (leafPhi.slice(1).reduce((s, v) => s + v, 0) + coverPhi) / (N + 1) / 180
      : open;
    const c = easeSine(centreOpen);
    const shift = -(CW / 2) * (1 - c);
    book.style.transform = `translate3d(${shift}px, ${-PH / 2}px, 0) rotateZ(-1.2deg)`;

    // contact shadow follows the footprint (left half appears as the cover lands)
    const foot = 0.5 + 0.5 * Math.max(0, -Math.cos(coverPhi * D2R));
    shadowWide.style.transform = `translateZ(0.2px) scaleX(${foot.toFixed(4)})`;
    shadowTight.style.transform = `translateZ(0.3px) scaleX(${foot.toFixed(4)})`;

    camC = c;
    applyCamera();

    // UI
    hint.style.opacity = (1 - clamp(p / 0.03)).toFixed(3);
    endHint.style.opacity = clamp((p - 0.992) / 0.006).toFixed(3);
    let best = 0, bd = 9;
    navItems.forEach((a, i) => { const d = Math.abs(+a.dataset.p - p); if (d < bd) { bd = d; best = i; } });
    railFill.style.transform = `scaleY(${p.toFixed(4)})`;
    navItems.forEach((a, i) => {
      a.classList.toggle("on", i === best);
      a.classList.toggle("past", +a.dataset.p <= p + 1e-4 && i !== best);
    });
    if (best !== activeIdx) {
      const first = activeIdx < 0;
      activeIdx = best;
      const a = navItems[best];
      const apply = () => {
        roNum.textContent = a.dataset.num === "·" ? ALBUM.title : a.dataset.num;
        roName.textContent = a.dataset.name;
        const spreadNo = Math.min(5, Math.max(0, best));
        icNow.textContent = String(best === navItems.length - 1 ? 0 : spreadNo).padStart(2, "0");
        readout.classList.remove("swap");
      };
      clearTimeout(swapTimer);
      if (first) apply(); else { readout.classList.add("swap"); swapTimer = setTimeout(apply, 280); }
    }
  }

  /* ---------- parallax --------------------------------------------------
     The camera yaws/pitches a few degrees with the pointer. Because the scene
     is real 3D, the book, its stacked pages and the pencil on the desk shift
     against each other on their own. Screen-space layers (leaves, dust) add
     depth in front of and behind the scene, each at its own rate.          */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  const layers = [...document.querySelectorAll("[data-depth]")].map((n) => ({ n, d: +n.dataset.depth }));
  let camC = 0;

  function applyCamera() {
    const c = camC;
    const s = fitScale * (1 + 0.1 * (1 - c));
    const tilt = 44 - 4 * c - ptr.y * 2.2;
    const yaw = ptr.x * 3.2;
    world.style.transform =
      `translate3d(${(-ptr.x * 10).toFixed(2)}px, calc(${(-2 + 3 * c).toFixed(2)}vh + ${(-ptr.y * 8).toFixed(2)}px), 0) ` +
      `scale(${s.toFixed(4)}) rotateY(${yaw.toFixed(3)}deg) rotateX(${tilt.toFixed(3)}deg)`;
    const p = lastP < 0 ? 0 : lastP;
    for (const L of layers) {
      // depth > 0 = in front of the book (moves more, against the pointer); < 0 = behind
      const x = -ptr.x * L.d * 26;
      const y = -ptr.y * L.d * 18 - (p - 0.5) * L.d * 90;
      L.n.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    ptr.active = true;
    ptr.tx = (e.clientX / innerWidth) * 2 - 1;
    ptr.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { ptr.active = false; });

  /* ---------- dust in the lamp light ------------------------------------- */
  const dust = $("#dust");
  const dctx = dust.getContext("2d");
  let motes = [];
  function sizeDust() {
    dust.width = innerWidth; dust.height = innerHeight;
    const n = Math.round(Math.min(90, innerWidth * innerHeight / 18000));
    motes = Array.from({ length: n }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      r: 0.5 + Math.random() * 1.6, z: 0.3 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.06, vy: -0.02 - Math.random() * 0.05,
      ph: Math.random() * 6.28,
    }));
  }
  function drawDust(t) {
    dctx.clearRect(0, 0, dust.width, dust.height);
    const W = dust.width, H = dust.height;
    for (const m of motes) {
      m.x += m.vx + Math.sin(t / 3000 + m.ph) * 0.05; m.y += m.vy;
      if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
      if (m.x < -10) m.x = W + 10; if (m.x > W + 10) m.x = -10;
      const px = m.x - ptr.x * m.z * 30, py = m.y - ptr.y * m.z * 20;
      // brighter inside the lamp's cone (upper-left), nearly invisible outside it
      const beam = Math.max(0, 1 - Math.hypot(px / W - 0.22, py / H - 0.15) / 0.75);
      const tw = 0.6 + 0.4 * Math.sin(t / 900 + m.ph);
      const a = beam * tw * 0.55;
      if (a < 0.02) continue;
      dctx.fillStyle = `rgba(255,214,160,${a.toFixed(3)})`;
      dctx.beginPath(); dctx.arc(px, py, m.r * m.z, 0, 6.283); dctx.fill();
    }
  }
  sizeDust();

  /* ---------- scroll driver (continuous progress, smoothed) -------------- */
  let target = 0, current = 0, prevT = performance.now();
  const readScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    target = max > 0 ? clamp(scrollY / max) : 0;
  };
  function tick(now) {
    const dt = Math.min(64, now - prevT); prevT = now;
    const k = reduce ? 1 : 1 - Math.exp(-dt / 95);
    current += (target - current) * k;
    if (Math.abs(target - current) < 1e-5) current = target;
    render(current);

    // pointer parallax (with a slow idle drift when there's no mouse)
    if (!reduce) {
      let tx = ptr.tx, ty = ptr.ty;
      if (!ptr.active || !finePointer) { tx = Math.sin(now / 5200) * 0.35; ty = Math.sin(now / 7100) * 0.22; }
      const kp = 1 - Math.exp(-dt / 220);
      ptr.x += (tx - ptr.x) * kp; ptr.y += (ty - ptr.y) * kp;
      applyCamera();
      drawDust(now);
    }
    requestAnimationFrame(tick);
  }

  navItems.forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top: +a.dataset.p * max, behavior: "smooth" });
  }));

  addEventListener("scroll", readScroll, { passive: true });
  addEventListener("resize", () => { fit(); readScroll(); sizeDust(); });

  /* ---------- preload, then reveal ---------------------------------------- */
  const srcs = [...new Set(artworks.map((a) => a.src))];
  let loaded = 0;
  const bar = $(".loader i");
  Promise.all(srcs.map((s) => new Promise((res) => {
    const im = new Image();
    im.onload = im.onerror = () => { loaded++; bar.style.transform = `scaleX(${loaded / srcs.length})`; res(); };
    im.src = artURL(s);
  }))).then(() => {
    document.body.classList.add("ready");
  });

  fit();
  readScroll();
  current = target;
  render(current);
  requestAnimationFrame(tick);

  // debug/testing hook: window.__album.set(0.5)
  window.__album = { set: (p) => { target = current = p; lastP = -1; render(p); } };
})();
