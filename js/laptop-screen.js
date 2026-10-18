/* ==================================================================
   Laptop screen — puts the real Finder HTML on the laptop's display
   ------------------------------------------------------------------
   The HTML (laptop/finder-screen.html) is loaded once in an <iframe>
   and is ALWAYS the laptop's screen: it is mapped onto the tracked
   display corners of every frame in sequence 2 (js/laptop-screen-track.js),
   so it is the same page from the moment the lid opens.

   Scroll states (exposed as <html data-laptop-state="…">):
     MAIN_SCENE           – frames play, laptop not on screen
     LAPTOP_APPROACH      – laptop visible, HTML locked to its display
     HTML_ENTER           – camera moves into the display
     HTML_INTERACTION     – full-screen HTML owns scrolling and clicks;
                            the main animation is paused
     HTML_EXIT            – camera pulls back out of the display
     MAIN_SCENE_CONTINUE  – main animation continues

   Exit rule: only a scroll (or arrow / page key) on the HTML's LANDING
   page (Projects, no project open) leaves the laptop. Inside UI/UX,
   Coding or an open case study, scrolling stays inside the HTML.
   Scrolling down on the landing page continues the animation; scrolling
   up goes back out the way you came in.
   ================================================================== */
(function () {
  'use strict';

  var TRACK = window.LAPTOP_SCREEN_TRACK;
  if (!TRACK || !window.FrameScroll) return;

  var OPTIONS = {
    // Physical aspect of the laptop's display, measured from the footage
    // (frames where the camera faces the screen head-on: 1.60 → 16:10).
    // On the laptop the HTML is laid out at exactly this aspect.
    screenAspect: 16 / 10,
    // Where the HTML edge sits relative to the tracked display edge
    // (fraction of the display size). The track is refined to the exact
    // lit edge; a tiny negative value seals the seam (≈ half a pixel)
    // so no sliver of the original screen shows through.
    edgeInset: -0.005,
    enterLength: 0.9,       // scroll distance (× viewport height) of the move into the screen
    exitLength: 1.2,        // … and of the pull back out of it
    takeover: 0.22,         // last part of the move: screen → full-screen HTML
    rearm: 0.5,             // × viewport height away from the pause before it can catch again
    exitThreshold: 60,      // px of wheel movement on the landing page before leaving
    newGestureGap: 420,     // ms without wheel input that starts a new scroll gesture
    settleTime: 600,        // ms after entering before a gesture can leave again
    cornerRadius: 0.007,    // rounded top corners of the display (× width)
    // Distance blur, in on-screen px: strongest when the display is small
    // in frame, none once it fills ~90% of the viewport height.
    farBlur: 1.1, sharpAt: 0.8, blurCurve: 1.4,
    // Soft edge of the screen while it is on the laptop, in on-screen px:
    // the HTML reaches `seal` px past the tracked edge and fades out over
    // `feather` px (grows with the blur), so the edge reads like the filmed
    // screen's edge: no hard cut-out line and no sliver of the original
    // screen between the HTML and the bezel.
    seal: 1.5, feather: 1, featherPerBlur: 1.6,
    // Small colour match to the warm footage while the HTML is on the laptop.
    tone: { brightness: 0.95, contrast: 0.97, saturate: 0.92, sepia: 0.06 }
  };

  var FS = window.FrameScroll;
  var KEY = TRACK.seq;
  var CUT = TRACK.cut;

  var root, stage, wrap, frame, glare;
  var vw = 0, vh = 0;      // viewport (stage) size
  var lw = 0, lh = 0;      // HTML layout size while it is on the laptop (16:10)
  var pause = null;
  var locked = false, armed = true, prevY = null;
  var wheelAcc = 0, wheelTimer = 0;
  var lockedAt = 0, lastWheelAt = 0, gestureOk = false;
  var lastCss = {};
  var lastQuad = null;

  /* ---------- small geometry helpers ---------- */

  // Homography from the unit square to quad q = [[x,y]×4] (TL,TR,BR,BL).
  function squareToQuad(q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1];
    var x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var den = dx1 * dy2 - dx2 * dy1;
    var g = (dx3 * dy2 - dx2 * dy3) / den;
    var h = (dx1 * dy3 - dx3 * dy1) / den;
    return [
      [x1 - x0 + g * x1, x3 - x0 + h * x3, x0],
      [y1 - y0 + g * y1, y3 - y0 + h * y3, y0],
      [g, h, 1]
    ];
  }
  function inv3(m) {
    var a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2], g = m[2][0], h = m[2][1], i = m[2][2];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    var det = a * A + b * B + c * C;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
            [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
            [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  function mul3(p, q) {
    var r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) r[i][j] = p[i][0] * q[0][j] + p[i][1] * q[1][j] + p[i][2] * q[2][j];
    return r;
  }
  function apply(H, u, v) {
    var w = H[2][0] * u + H[2][1] * v + H[2][2];
    return [(H[0][0] * u + H[0][1] * v + H[0][2]) / w, (H[1][0] * u + H[1][1] * v + H[1][2]) / w];
  }
  // CSS matrix3d for a 3×3 point transform H (element origin at 0,0).
  function css3(H) {
    return 'matrix3d(' + [H[0][0], H[1][0], 0, H[2][0], H[0][1], H[1][1], 0, H[2][1], 0, 0, 1, 0, H[0][2], H[1][2], 0, H[2][2]]
      .map(function (n) { return +n.toFixed(10); }).join(',') + ')';
  }
  // Transform that maps an element of size w×h exactly onto quad q.
  function rectToQuad(q, w, h) { return mul3(squareToQuad(q), [[1 / w, 0, 0], [0, 1 / h, 0], [0, 0, 1]]); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function len(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function quadHeight(q) { return (len(q[0], q[3]) + len(q[1], q[2])) / 2; }
  function quadWidth(q) { return (len(q[0], q[1]) + len(q[3], q[2])) / 2; }
  function lerpQuad(p, q, t) { return p.map(function (c, i) { return [lerp(c[0], q[i][0], t), lerp(c[1], q[i][1], t)]; }); }

  /* ---------- where the display is in a given frame ---------- */

  // The display's lit area in stage px, pulled in by edgeInset so the HTML
  // always sits inside the physical screen (the screen is the mask).
  function displayQuad(k) {             // exact tracked display edge
    var c = TRACK.corners[k];
    var m = FS.frameToStage(KEY);
    if (!c || !m) return null;
    return [[m.x + c[0] * m.w, m.y + c[1] * m.h], [m.x + c[2] * m.w, m.y + c[3] * m.h],
            [m.x + c[4] * m.w, m.y + c[5] * m.h], [m.x + c[6] * m.w, m.y + c[7] * m.h]];
  }
  function screenQuad(k) {
    var q = displayQuad(k);
    if (!q) return null;
    var H = squareToQuad(q), ix = OPTIONS.edgeInset, iy = OPTIONS.edgeInset * OPTIONS.screenAspect;
    return [apply(H, ix, iy), apply(H, 1 - ix, iy), apply(H, 1 - ix, 1 - iy), apply(H, ix, 1 - iy)];
  }

  // Where the display ends up when the camera has moved right up to it:
  // a 16:10 rectangle that covers the viewport (same size as the HTML layout).
  function coverRect() {
    var x = (vw - lw) / 2, y = (vh - lh) / 2;
    return [[x, y], [x + lw, y], [x + lw, y + lh], [x, y + lh]];
  }

  /* ---------- pause point: enter / exit frames for this viewport ---------- */

  // Enter on the closest approach frame where the display still fits inside
  // that cover rectangle (so the final push-in only ever moves the camera
  // closer), and leave on the first frame after the footage's cut where it
  // fits again.
  // A frame qualifies when (1) its display fits inside the cover rectangle
  // and (2) warping the scene to bring that display up to the viewport keeps
  // the footage covering the whole viewport at every step (no empty edge).
  function inside(p, q) {             // point p inside convex quad q
    var sgn = 0;
    for (var i = 0; i < 4; i++) {
      var a = q[i], b = q[(i + 1) % 4];
      var c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (Math.abs(c) < 1e-6) continue;
      if (sgn === 0) sgn = c > 0 ? 1 : -1; else if ((c > 0 ? 1 : -1) !== sgn) return false;
    }
    return true;
  }
  function usable(k) {
    var Q = screenQuad(k);
    if (!Q || quadWidth(Q) > lw + 0.5 || quadHeight(Q) > lh + 0.5) return false;
    var view = [[0, 0], [vw, 0], [vw, vh], [0, vh]], HQ = inv3(squareToQuad(Q)), C = coverRect();
    for (var t = 0.25; t <= 1.0001; t += 0.25) {
      var H = mul3(squareToQuad(lerpQuad(Q, C, smooth(t))), HQ);
      var warped = view.map(function (p) { return apply(H, p[0], p[1]); });
      for (var i = 0; i < 4; i++) if (!inside(view[i], warped)) return false;
    }
    return true;
  }
  function computePause() {
    var enter = CUT, exit = CUT + 1, k;
    for (k = CUT; k >= 20; k--) if (usable(k)) { enter = k; break; }
    for (k = CUT + 1; k <= 200; k++) if (usable(k)) { exit = k; break; }
    pause = { enterFrame: enter, exitFrame: exit, enterPx: Math.round(OPTIONS.enterLength * vh), exitPx: Math.round(OPTIONS.exitLength * vh) };
    FS.setPause(KEY, pause);
  }

  /* ---------- rendering ---------- */

  function setCss(el, name, prop, value) {
    var id = name + prop;
    if (lastCss[id] === value) return;
    lastCss[id] = value;
    el.style[prop] = value;
  }

  function distanceBlur(screenH) {
    var t = clamp01((OPTIONS.sharpAt - screenH / vh) / (OPTIONS.sharpAt - 0.2));
    return OPTIONS.farBlur * Math.pow(t, OPTIONS.blurCurve);
  }

  function render(st) {
    var canvas = FS.canvas();
    if (!st || st.seq !== KEY || !TRACK.corners[st.frame]) {
      setCss(wrap, 'w', 'visibility', 'hidden');
      setCss(canvas, 'c', 'transform', '');
      setState(st && st.seq && st.seq > KEY ? 'MAIN_SCENE_CONTINUE' : 'MAIN_SCENE');
      return;
    }
    var k = st.frame;
    var Q = screenQuad(k);                    // physical display (the mask)
    var a = st.phase ? st.amount : 0;         // 0 on the laptop … 1 full screen
    var T = OPTIONS.takeover;
    var a1 = clamp01(a / (1 - T));            // camera moves up to the display
    var a2 = clamp01((a - (1 - T)) / T);      // display hands over to full-screen HTML
    var e1 = smooth(a1), e2 = smooth(a2);

    var P = Q;                                // where the HTML sits (always = display)
    var w = lw, h = lh;                       // HTML layout size
    var canvasT = '';
    var Hs = null;

    if (st.phase) {
      // 1) Camera moves in: the whole scene is warped so the display grows to
      //    the cover rectangle. The HTML is mapped onto the same warped
      //    display corners, so screen and HTML move as one surface.
      P = lerpQuad(Q, coverRect(), e1);
      if (e1 > 0) {
        Hs = mul3(squareToQuad(P), inv3(squareToQuad(Q)));
        canvasT = css3(Hs);
      }
      // 2) The display now covers the viewport; the HTML's layout settles
      //    from 16:10 to the viewport's size (menu bar and dock come in).
      if (a2 > 0) {
        w = lerp(lw, vw, e2); h = lerp(lh, vh, e2);
        var x = (vw - w) / 2, y = (vh - h) / 2;
        P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      }
    }

    var onLaptop = 1 - e1;                    // 1 on the laptop, 0 once the camera is at the screen
    var r = OPTIONS.cornerRadius * w * (1 - e2);

    // Blur: distance blur (far → soft, close → sharp) plus the footage's own
    // defocus late in the shot. Computed in on-screen px, applied in the
    // HTML's own px.
    var m = FS.frameToStage(KEY);
    var screenScale = quadHeight(P) / h;      // HTML px → on-screen px
    var blurScreen = (distanceBlur(quadHeight(P)) + (TRACK.blur[k] || 0) * (m.w / 1280)) * (1 - e2);
    var blur = blurScreen > 0.02 ? blurScreen / Math.max(0.04, screenScale) : 0;

    // The display is the mask: only the part of the HTML inside it shows.
    var clip = 'inset(0 round ' + r.toFixed(2) + 'px ' + r.toFixed(2) + 'px 0 0)';
    var t = OPTIONS.tone;
    var filter = (onLaptop > 0.001
      ? 'brightness(' + lerp(1, t.brightness, onLaptop).toFixed(3) + ') contrast(' + lerp(1, t.contrast, onLaptop).toFixed(3) +
        ') saturate(' + lerp(1, t.saturate, onLaptop).toFixed(3) + ') sepia(' + lerp(0, t.sepia, onLaptop).toFixed(3) + ')'
      : '');
    // The blur is applied by a layer ON TOP of the HTML (backdrop blur,
    // clipped to the display). Unlike blurring the HTML itself, this keeps
    // the edges fully opaque, so nothing of the original screen shows
    // through and no part of the interface is cropped.
    // (backdrop blur is measured in on-screen px)
    var backdrop = blurScreen > 0.05 ? 'blur(' + blurScreen.toFixed(2) + 'px)' : 'none';

    lastQuad = P;
    // Soft edge (fades out as the camera reaches the screen).
    var fpx = onLaptop * (OPTIONS.feather + OPTIONS.featherPerBlur * blurScreen);
    var opx = onLaptop * (OPTIONS.seal + fpx / 2);
    var E = P;
    if (opx > 0.01) {
      var HP = squareToQuad(P), ox = opx / quadWidth(P), oy = opx / quadHeight(P);
      E = [apply(HP, -ox, -oy), apply(HP, 1 + ox, -oy), apply(HP, 1 + ox, 1 + oy), apply(HP, -ox, 1 + oy)];
    }
    var fl = fpx / Math.max(0.04, quadHeight(E) / h);   // feather in the HTML's own px
    var mask = fl > 0.05
      ? 'linear-gradient(to right, transparent, #000 ' + fl.toFixed(2) + 'px, #000 calc(100% - ' + fl.toFixed(2) + 'px), transparent),' +
        'linear-gradient(to bottom, transparent, #000 ' + fl.toFixed(2) + 'px, #000 calc(100% - ' + fl.toFixed(2) + 'px), transparent)'
      : 'none';
    var tf = a >= 0.999 ? 'none' : css3(rectToQuad(E, w, h));
    var tfFrame = a >= 0.999 ? 'none' : css3(rectToQuad(E, Math.round(w), Math.round(h)));
    setCss(frame, 'f', 'webkitMaskImage', mask);
    setCss(frame, 'f', 'maskImage', mask);
    setCss(wrap, 'w', 'visibility', 'visible');
    setCss(canvas, 'c', 'transform', canvasT);
    setCss(frame, 'f', 'width', Math.round(w) + 'px');
    setCss(frame, 'f', 'height', Math.round(h) + 'px');
    setCss(frame, 'f', 'transform', tfFrame);
    setCss(frame, 'f', 'clipPath', a >= 0.999 ? 'none' : clip);
    setCss(frame, 'f', 'filter', filter.trim() || 'none');
    setCss(glare, 'g', 'width', Math.round(w) + 'px');
    setCss(glare, 'g', 'height', Math.round(h) + 'px');
    setCss(glare, 'g', 'transform', tf);
    setCss(glare, 'g', 'clipPath', clip);
    setCss(glare, 'g', 'backdropFilter', backdrop);
    setCss(glare, 'g', 'webkitBackdropFilter', backdrop);
    // glare gradient fades out as the camera reaches the screen; the layer
    // itself stays (it carries the blur)
    setCss(glare, 'g', 'backgroundImage', onLaptop > 0.001 ? '' : 'none');
    setCss(glare, 'g', 'visibility', (onLaptop > 0.001 || blurScreen > 0.05) ? 'inherit' : 'hidden');

    if (locked) setState('HTML_INTERACTION');
    else if (st.phase === 'enter') setState('HTML_ENTER');
    else if (st.phase === 'exit') setState('HTML_EXIT');
    else if (k <= (pause ? pause.enterFrame : CUT)) setState('LAPTOP_APPROACH');
    else setState('MAIN_SCENE_CONTINUE');
  }

  function setState(s) {
    if (document.documentElement.getAttribute('data-laptop-state') !== s) {
      document.documentElement.setAttribute('data-laptop-state', s);
    }
  }

  /* ---------- scroll ownership ---------- */

  function lock() {
    var y = FS.pauseScrollY(KEY);
    if (y == null) return;
    locked = true; armed = false;
    window.scrollTo(0, Math.round(y));
    prevY = Math.round(y);
    document.documentElement.classList.add('frame-scroll-locked');
    root.classList.add('is-laptop-active');
    wrap.classList.add('is-interactive');
    wrap.removeAttribute('aria-hidden');
    wheelAcc = 0;
    // The scroll that carried the visitor in (including trackpad momentum)
    // must not carry them straight back out: only a new gesture can leave.
    lockedAt = lastWheelAt = performance.now();
    gestureOk = false;
    setState('HTML_INTERACTION');
    setTimeout(function () { try { frame.focus({ preventScroll: true }); } catch (e) {} }, 0);
  }

  function unlock(dir) {
    if (!locked) return;
    locked = false; armed = false;
    document.documentElement.classList.remove('frame-scroll-locked');
    root.classList.remove('is-laptop-active');
    wrap.classList.remove('is-interactive');
    wrap.setAttribute('aria-hidden', 'true');
    try { frame.blur(); window.focus(); } catch (e) {}
    var y = FS.pauseScrollY(KEY);
    // Hand the gesture back to the main animation, already moving the way
    // the visitor scrolled.
    // Carry the view through the whole exit (or entry) stretch in one go, so
    // it never parks half-way through the transition. The main animation's
    // own smoothing turns this jump into one continuous move.
    var span = dir > 0 ? (pause ? pause.exitPx : 0.25 * vh) : (pause ? pause.enterPx : 0.25 * vh);
    window.scrollTo(0, Math.round(y + dir * (span + 0.06 * vh)));
    prevY = window.scrollY;
  }

  function onScroll() {
    var y = window.scrollY;
    var py = FS.pauseScrollY(KEY);
    if (py == null) { prevY = y; return; }
    // a jump from the navigation bar passes over this pause without stopping
    if (!locked && window.SiteUI && window.SiteUI.jumping()) { prevY = y; armed = false; return; }
    if (locked) {
      if (Math.abs(y - py) > 1) window.scrollTo(0, Math.round(py));
      prevY = Math.round(py);
      return;
    }
    if (!armed && Math.abs(y - py) > OPTIONS.rearm * vh) armed = true;
    if (armed && prevY !== null && ((prevY < py - 1 && y >= py) || (prevY > py + 1 && y <= py))) lock();
    prevY = window.scrollY;
  }

  // Messages from the HTML (see the small bridge script at the end of
  // laptop/finder-screen.html): wheel / key input plus whether the HTML is
  // on its landing page.
  function onMessage(ev) {
    var d = ev.data;
    if (!d || !d.frameScroll || ev.source !== frame.contentWindow || !locked) return;
    var now = performance.now();
    if (d.frameScroll === 'wheel') {
      if (now - lastWheelAt > OPTIONS.newGestureGap && now - lockedAt > OPTIONS.settleTime) gestureOk = true;
      lastWheelAt = now;
    }
    if (!d.landing) { wheelAcc = 0; gestureOk = false; return; }   // a case study is open: stay in the HTML
    if (d.frameScroll === 'key') { if (now - lockedAt > OPTIONS.settleTime) unlock(d.dir > 0 ? 1 : -1); return; }
    if (d.frameScroll === 'wheel') {
      if (!gestureOk) return;
      wheelAcc += d.dy;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { wheelAcc = 0; }, 250);
      if (wheelAcc > OPTIONS.exitThreshold) unlock(1);
      else if (wheelAcc < -OPTIONS.exitThreshold) unlock(-1);
    }
  }

  /* ---------- setup ---------- */

  function sizeLayers() {
    vw = stage.clientWidth; vh = stage.clientHeight;
    // HTML layout size on the laptop: 16:10, covering the viewport, so the
    // final hand-over to full screen only ever grows the visible area.
    lw = Math.max(vw, vh * OPTIONS.screenAspect); lh = lw / OPTIONS.screenAspect;
    lastCss = {};
    computePause();
    if (locked) { var y = FS.pauseScrollY(KEY); if (y != null) window.scrollTo(0, Math.round(y)); }
    FS.refresh();
  }

  function init() {
    root = FS.root();
    if (!root) return;
    stage = root.querySelector('.frame-scroll__stage');
    wrap = root.querySelector('.laptop-screen');
    if (!stage || !wrap) return;
    frame = wrap.querySelector('.laptop-screen__frame');
    glare = wrap.querySelector('.laptop-screen__glare');

    sizeLayers();
    FS.onRender(render);
    prevY = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', sizeLayers);
    window.addEventListener('message', onMessage);
    // While the HTML owns scrolling, the page itself must not move.
    window.addEventListener('wheel', function (e) { if (locked) e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', function (e) {
      if (locked && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key)) e.preventDefault();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.LaptopScreen = {
    options: OPTIONS,
    pause: function () { return pause; },
    isLocked: function () { return locked; },
    screenQuad: function () { return lastQuad; },   // where the HTML sits now (stage px)
    exit: unlock
  };
})();
