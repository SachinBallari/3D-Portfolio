/* ==================================================================
   Camera screen — puts the real camera HTML on the camera's rear display
   ------------------------------------------------------------------
   The HTML (camera/sony-fx3-screen.html: the camera interface plus a
   small bridge script) is loaded once in an <iframe> and is ALWAYS the
   camera's display: it is mapped onto the tracked display corners of
   every frame where the camera is on screen (sequence 2 frame 140 to
   sequence 3 frame 29, js/camera-screen-track.js), so it is the same
   screen from the wide shot to the close-up.

   Scroll states (exposed as <html data-camera-state="…">):
     MAIN_SCENE               – frames play, camera display not on screen
     CAMERA_APPROACH          – camera visible, HTML locked to its display
     CAMERA_SCREEN_ENTRY      – the view moves into the display
     CAMERA_HTML_INTERACTION  – full-screen camera HTML owns scrolling and
                                clicks; the main animation is paused
     CAMERA_EXIT              – the view pulls back out of the display
     MAIN_SCENE_CONTINUE      – main animation continues

   Exit rule: a scroll anywhere on the screen leaves the camera HTML once
   the HTML has nothing of its own left to scroll that way (the menu and
   the photo viewer never scroll; the Photography / Videography grid
   scrolls first, then the next scroll leaves). Scrolling down continues
   the animation; scrolling up goes back out the way you came in.

   The camera HTML fills whatever box it is given (its sizes follow the
   box height), so on the camera it is laid out at the display's own
   shape (about 1.31 : 1) and fills the display edge to edge. The view
   pushes in until the display is exactly as tall as the viewport, then
   the display widens (or narrows) to the viewport: the text and images
   keep their size the whole time, nothing is stretched, and there is no
   empty band at the sides.
   ================================================================== */
(function () {
  'use strict';

  var TRACK = window.CAMERA_SCREEN_TRACK;
  if (!TRACK || !window.FrameScroll) return;

  var OPTIONS = {
    edgeInset: -0.004,        // HTML edge vs tracked display edge (× display size)
    enterLength: 0.9,         // scroll distance (× viewport height) of the move into the display
    exitLength: 1.2,          // … and of the pull back out of it
    takeover: 0.22,           // last part of the move: display → full-screen HTML
    rearm: 0.5,               // × viewport height away from the pause before it can catch again
    exitThreshold: 60,        // px of wheel movement (with nothing left to scroll) before leaving
    newGestureGap: 420,       // ms without wheel input that starts a new scroll gesture
    settleTime: 600,          // ms after entering before a gesture can leave again
    keepScrolling: 1e9,       // a continuous scroll never carries through: the screen holds until a new scroll
    cornerRadius: 0.006,      // rounded corners of the display (× width)
    enterSearch: [1, 4],      // frames searched for the pause (the footage jerks from frame 5)
    // The screen is OFF (the footage's own dark display shows) in the wide
    // shots and switches ON as the view nears the camera, on the frame
    // where the camera in the footage lights its own screen (seq 2, 233→234).
    screenOn: { seq: '2', frame: 231, fade: 2 },   // fully on by 233, a frame before the footage lights its own menu
    // Distance blur, in on-screen px: strongest when the display is small
    // in frame, none once it is close.
    farBlur: 1.1, sharpAt: 0.55, blurCurve: 1.4,
    // Soft, sealed edge while on the camera (on-screen px), as on the laptop.
    seal: 1.2, feather: 0.8, featherPerBlur: 1.6,
    // Small match to the warm footage while the HTML is on the camera.
    tone: { brightness: 0.93, contrast: 0.97, saturate: 0.94, sepia: 0.05 }
  };

  var FS = window.FrameScroll;
  var KEY = TRACK.pauseSeq;

  var root, stage, wrap, frame, glare, back;
  var vw = 0, vh = 0;
  var lw = 0, lh = 0;        // HTML layout size on the camera (display's own shape, viewport height)
  var pause = null;
  var locked = false, armed = true, prevY = null;
  var wheelAcc = 0, wheelTimer = 0;
  var lockedAt = 0, lastWheelAt = 0, gestureOk = false, gestureStart = 0, innerAt = 0;
  var lastCss = {};
  var lastQuad = null;
  var ownsCanvas = false;

  /* ---------- geometry helpers ---------- */

  function squareToQuad(q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1];
    var x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var den = dx1 * dy2 - dx2 * dy1;
    var g = (dx3 * dy2 - dx2 * dy3) / den;
    var h = (dx1 * dy3 - dx3 * dy1) / den;
    return [[x1 - x0 + g * x1, x3 - x0 + h * x3, x0], [y1 - y0 + g * y1, y3 - y0 + h * y3, y0], [g, h, 1]];
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
  function css3(H) {
    return 'matrix3d(' + [H[0][0], H[1][0], 0, H[2][0], H[0][1], H[1][1], 0, H[2][1], 0, 0, 1, 0, H[0][2], H[1][2], 0, H[2][2]]
      .map(function (n) { return +n.toFixed(10); }).join(',') + ')';
  }
  function rectToQuad(q, w, h) { return mul3(squareToQuad(q), [[1 / w, 0, 0], [0, 1 / h, 0], [0, 0, 1]]); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function len(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function quadHeight(q) { return (len(q[0], q[3]) + len(q[1], q[2])) / 2; }
  function quadWidth(q) { return (len(q[0], q[1]) + len(q[3], q[2])) / 2; }
  function lerpQuad(p, q, t) { return p.map(function (c, i) { return [lerp(c[0], q[i][0], t), lerp(c[1], q[i][1], t)]; }); }

  /* ---------- where the display is ---------- */

  function cornersOf(seq, k) { var s = TRACK.corners[seq]; return s ? s[k] : null; }
  function screenQuad(seq, k) {
    var c = cornersOf(seq, k), m = FS.frameToStage(seq);
    if (!c || !m) return null;
    var q = [[m.x + c[0] * m.w, m.y + c[1] * m.h], [m.x + c[2] * m.w, m.y + c[3] * m.h],
             [m.x + c[4] * m.w, m.y + c[5] * m.h], [m.x + c[6] * m.w, m.y + c[7] * m.h]];
    var H = squareToQuad(q), ix = OPTIONS.edgeInset, iy = OPTIONS.edgeInset * TRACK.aspect;
    return [apply(H, ix, iy), apply(H, 1 - ix, iy), apply(H, 1 - ix, 1 - iy), apply(H, ix, 1 - iy)];
  }

  // Where the display ends up when the view has moved right up to it: the
  // display's own shape, exactly as tall as the viewport.
  function coverRect() {
    var x = (vw - lw) / 2, y = (vh - lh) / 2;
    return [[x, y], [x + lw, y], [x + lw, y + lh], [x, y + lh]];
  }

  /* ---------- pause point ---------- */

  function inside(p, q) {
    var sgn = 0;
    for (var i = 0; i < 4; i++) {
      var a = q[i], b = q[(i + 1) % 4];
      var c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (Math.abs(c) < 1e-6) continue;
      if (sgn === 0) sgn = c > 0 ? 1 : -1; else if ((c > 0 ? 1 : -1) !== sgn) return false;
    }
    return true;
  }
  // The scene can be warped to bring the display up to the cover rectangle
  // without the footage ever leaving an empty edge.
  function usable(k) {
    var Q = screenQuad(KEY, k);
    if (!Q || quadWidth(Q) > lw + 0.5) return false;
    var view = [[0, 0], [vw, 0], [vw, vh], [0, vh]], HQ = inv3(squareToQuad(Q)), C = coverRect();
    for (var t = 0.25; t <= 1.0001; t += 0.25) {
      var H = mul3(squareToQuad(lerpQuad(Q, C, smooth(t))), HQ);
      var warped = view.map(function (p) { return apply(H, p[0], p[1]); });
      for (var i = 0; i < 4; i++) if (!inside(view[i], warped)) return false;
    }
    return true;
  }
  // Enter on the frame (near the start of the sequence) where the display
  // is largest in view; the footage continues straight on afterwards.
  function computePause() {
    var best = OPTIONS.enterSearch[0], bestW = -1;
    for (var k = OPTIONS.enterSearch[0]; k <= OPTIONS.enterSearch[1]; k++) {
      var Q = screenQuad(KEY, k);
      if (!Q || !usable(k)) continue;
      var w = quadWidth(Q);
      if (w > bestW) { bestW = w; best = k; }
    }
    pause = { enterFrame: best, exitFrame: best + 1, enterPx: Math.round(OPTIONS.enterLength * vh), exitPx: Math.round(OPTIONS.exitLength * vh) };
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
    var t = clamp01((OPTIONS.sharpAt - screenH / vh) / (OPTIONS.sharpAt - 0.05));
    return OPTIONS.farBlur * Math.pow(t, OPTIONS.blurCurve);
  }

  function setState(s) {
    if (document.documentElement.getAttribute('data-camera-state') !== s) {
      document.documentElement.setAttribute('data-camera-state', s);
    }
  }

  function hide(st) {
    setCss(wrap, 'w', 'visibility', 'hidden');
    if (ownsCanvas) { FS.canvas().style.transform = ''; ownsCanvas = false; }
    var after = st && (st.seq > KEY || (st.seq === KEY && st.frame > 1));
    setState(after ? 'MAIN_SCENE_CONTINUE' : 'MAIN_SCENE');
  }

  // 0 = screen off, 1 = on.
  function power(seq, k) {
    var o = OPTIONS.screenOn;
    if (seq > o.seq) return 1;
    if (seq < o.seq) return 0;
    return clamp01((k - o.frame + 1) / (o.fade + 1));
  }

  function render(st) {
    if (!st || !cornersOf(st.seq, st.frame)) { hide(st); return; }
    var on = power(st.seq, st.frame);
    if (on <= 0) {                       // wide shot: display left dark, as filmed
      hide(st);
      setState('CAMERA_APPROACH');
      return;
    }
    var seq = st.seq, k = st.frame;
    var phase = seq === KEY ? st.phase : null;
    var Q = screenQuad(seq, k);
    var a = phase ? st.amount : 0;
    var T = OPTIONS.takeover;
    var a1 = clamp01(a / (1 - T));
    var a2 = clamp01((a - (1 - T)) / T);
    var e1 = smooth(a1), e2 = smooth(a2);

    var P = Q, w = lw, h = lh, canvasT = '';
    if (phase) {
      // 1) The view moves in: the whole scene is warped so the display
      //    grows to the cover rectangle; the HTML rides on the same corners.
      P = lerpQuad(Q, coverRect(), e1);
      if (e1 > 0) canvasT = css3(mul3(squareToQuad(P), inv3(squareToQuad(Q))));
      // 2) Hand-over to full screen: the display (already viewport height)
      //    widens / narrows to the viewport; the HTML's sizes follow its
      //    height, so nothing changes size or stretches.
      if (a2 > 0) {
        w = lerp(lw, vw, e2); h = vh;
        var x = (vw - w) / 2, y = (vh - h) / 2;
        P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      }
    }

    var onCam = 1 - e1;
    var r = OPTIONS.cornerRadius * w * (1 - e2);
    var m = FS.frameToStage(seq);
    var blurScreen = (distanceBlur(quadHeight(P)) + (TRACK.blur[seq + ':' + k] || 0) * (m.w / 1280)) * onCam;

    var clip = 'inset(0 round ' + r.toFixed(2) + 'px)';
    var t = OPTIONS.tone;
    var filter = onCam > 0.001
      ? 'brightness(' + lerp(1, t.brightness, onCam).toFixed(3) + ') contrast(' + lerp(1, t.contrast, onCam).toFixed(3) +
        ') saturate(' + lerp(1, t.saturate, onCam).toFixed(3) + ') sepia(' + lerp(0, t.sepia, onCam).toFixed(3) + ')'
      : 'none';
    var backdrop = blurScreen > 0.05 ? 'blur(' + blurScreen.toFixed(2) + 'px)' : 'none';

    lastQuad = P;
    // Soft, sealed edge (fades out as the view reaches the display).
    var fpx = onCam * (OPTIONS.feather + OPTIONS.featherPerBlur * blurScreen);
    var opx = onCam * (OPTIONS.seal + fpx / 2);
    var E = P;
    if (opx > 0.01) {
      var HP = squareToQuad(P), ox = opx / quadWidth(P), oy = opx / quadHeight(P);
      E = [apply(HP, -ox, -oy), apply(HP, 1 + ox, -oy), apply(HP, 1 + ox, 1 + oy), apply(HP, -ox, 1 + oy)];
    }
    var fl = fpx / Math.max(0.04, quadHeight(E) / h);
    var mask = fl > 0.05
      ? 'linear-gradient(to right, transparent, #000 ' + fl.toFixed(2) + 'px, #000 calc(100% - ' + fl.toFixed(2) + 'px), transparent),' +
        'linear-gradient(to bottom, transparent, #000 ' + fl.toFixed(2) + 'px, #000 calc(100% - ' + fl.toFixed(2) + 'px), transparent)'
      : 'none';
    var full = a >= 0.999;
    var tf = full ? 'none' : css3(rectToQuad(E, w, h));
    var tfFrame = full ? 'none' : css3(rectToQuad(E, Math.round(w), Math.round(h)));

    // black backing slightly larger than the display: hides the footage's
    // own lit screen so only this HTML shows on the camera
    if (back) {
      var HB = squareToQuad(E), bx = 0.012, by = 0.012;
      var B = [apply(HB, -bx, -by), apply(HB, 1 + bx, -by), apply(HB, 1 + bx, 1 + by), apply(HB, -bx, 1 + by)];
      setCss(back, 'b', 'transform', full ? 'none' : css3(rectToQuad(B, 100, 100)));
      setCss(back, 'b', 'visibility', full ? 'hidden' : 'inherit');
    }
    setCss(wrap, 'w', 'visibility', 'visible');
    setCss(wrap, 'w', 'opacity', on >= 1 ? '' : on.toFixed(3));
    if (canvasT || ownsCanvas) { FS.canvas().style.transform = canvasT; ownsCanvas = !!canvasT; }
    setCss(frame, 'f', 'webkitMaskImage', mask);
    setCss(frame, 'f', 'maskImage', mask);
    setCss(frame, 'f', 'width', Math.round(w) + 'px');
    setCss(frame, 'f', 'height', Math.round(h) + 'px');
    setCss(frame, 'f', 'transform', tfFrame);
    setCss(frame, 'f', 'clipPath', full ? 'none' : clip);
    setCss(frame, 'f', 'filter', filter);
    setCss(glare, 'g', 'width', Math.round(w) + 'px');
    setCss(glare, 'g', 'height', Math.round(h) + 'px');
    setCss(glare, 'g', 'transform', tf);
    setCss(glare, 'g', 'clipPath', clip);
    setCss(glare, 'g', 'backdropFilter', backdrop);
    setCss(glare, 'g', 'webkitBackdropFilter', backdrop);
    setCss(glare, 'g', 'backgroundImage', onCam > 0.001 ? '' : 'none');
    setCss(glare, 'g', 'visibility', (onCam > 0.001 || blurScreen > 0.05) ? 'inherit' : 'hidden');

    if (locked) setState('CAMERA_HTML_INTERACTION');
    else if (phase === 'enter') setState('CAMERA_SCREEN_ENTRY');
    else if (phase === 'exit') setState('CAMERA_EXIT');
    else if (seq !== KEY || k <= (pause ? pause.enterFrame : 1)) setState('CAMERA_APPROACH');
    else setState('MAIN_SCENE_CONTINUE');
  }

  /* ---------- scroll ownership ---------- */

  function lock() {
    var y = FS.pauseScrollY(KEY);
    if (y == null) return;
    locked = true; armed = false;
    window.scrollTo(0, Math.round(y));
    prevY = Math.round(y);
    document.documentElement.classList.add('frame-scroll-locked');
    root.classList.add('is-camera-active');
    wrap.classList.add('is-interactive');
    wrap.removeAttribute('aria-hidden');
    wheelAcc = 0;
    lockedAt = lastWheelAt = gestureStart = performance.now();
    gestureOk = false; innerAt = 0;
    setState('CAMERA_HTML_INTERACTION');
    setTimeout(function () { try { frame.focus({ preventScroll: true }); } catch (e) {} }, 0);
  }

  function unlock(dir) {
    if (!locked) return;
    locked = false; armed = false;
    document.documentElement.classList.remove('frame-scroll-locked');
    root.classList.remove('is-camera-active');
    wrap.classList.remove('is-interactive');
    wrap.setAttribute('aria-hidden', 'true');
    try { frame.blur(); window.focus(); } catch (e) {}
    var y = FS.pauseScrollY(KEY);
    // carry the view through the whole exit / entry stretch in one move
    var span = pause ? (dir > 0 ? pause.exitPx : pause.enterPx) : 0.25 * vh;
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

  function onMessage(ev) {
    var d = ev.data;
    if (!d || !d.frameScroll || ev.source !== frame.contentWindow || !locked) return;
    var now = performance.now();
    if (d.frameScroll === 'wheel') {
      // A new scroll gesture (after a short gap) may leave; so may one long
      // continuous scroll that has run out of things to scroll.
      if (now - lastWheelAt > OPTIONS.newGestureGap) gestureStart = now;
      lastWheelAt = now;
      if (now - lockedAt > OPTIONS.settleTime &&
          (gestureStart > lockedAt || now - lockedAt > OPTIONS.keepScrolling) &&
          (!innerAt || gestureStart > innerAt || now - innerAt > OPTIONS.keepScrolling)) gestureOk = true;
    }
    if (!d.landing) {                            // the gallery grid is scrolling: stay in the HTML
      wheelAcc = 0; gestureOk = false; innerAt = now; return;
    }
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
    lh = vh; lw = vh * TRACK.aspect;
    lastCss = {};
    computePause();
    if (locked) { var y = FS.pauseScrollY(KEY); if (y != null) window.scrollTo(0, Math.round(y)); }
    FS.refresh();
  }

  function init() {
    root = FS.root();
    if (!root) return;
    stage = root.querySelector('.frame-scroll__stage');
    wrap = root.querySelector('.camera-screen');
    if (!stage || !wrap) return;
    frame = wrap.querySelector('.camera-screen__frame');
    glare = wrap.querySelector('.camera-screen__glare');
    back = document.createElement('div');
    back.className = 'camera-screen__back';
    back.setAttribute('aria-hidden', 'true');
    back.style.cssText = 'position:absolute;left:0;top:0;width:100px;height:100px;transform-origin:0 0;background:#000;filter:blur(1.5px);pointer-events:none;';
    wrap.insertBefore(back, frame);

    sizeLayers();
    FS.onRender(render);
    prevY = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', sizeLayers);
    window.addEventListener('message', onMessage);
    window.addEventListener('wheel', function (e) { if (locked) e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', function (e) {
      if (locked && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key)) e.preventDefault();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CameraScreen = {
    options: OPTIONS,
    pause: function () { return pause; },
    isLocked: function () { return locked; },
    screenQuad: function () { return lastQuad; },
    exit: unlock
  };
})();
