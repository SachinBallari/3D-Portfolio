/* ==================================================================
   Album section — the art album plays at the end of the animation
   ------------------------------------------------------------------
   The album (Art Album/album-embed.html: the album page plus a small
   bridge script) sits in its own pinned stage right after the frame
   animation. Its scroll is driven by this page:

     1. HAND-OFF   The last frame of sequence 3 (the closed "Album" book
                   on the desk) is held on screen and eased so its book
                   lands exactly on the album's own cover, while the album
                   fades in on top. The two books become one.
     2. ALBUM      Scrolling opens the album and turns its pages
                   (album progress 0 → 1). Scrolling up plays it all back
                   and returns into the animation.

   States: <html data-album-state="ANIMATION | ALBUM_HANDOFF | ALBUM">.
   ================================================================== */
(function () {
  'use strict';

  var FS = window.FrameScroll;
  if (!FS) return;

  var OPTIONS = {
    lastSeq: '3', lastFrame: 136,
    // corners of the closed book's cover in the last frame (normalised
    // to the frame, TL, TR, BR, BL), measured from Frames/3 frame 136
    bookCorners: [[910 / 2560, 310 / 1440], [1650 / 2560, 320 / 1440], [1690 / 2560, 1160 / 1440], [855 / 2560, 1160 / 1440]],
    handoff: 0.7,       // × viewport height of scroll for the hand-off
    album: 10.5,        // × viewport height of scroll for the whole album (as in its own page)
    smoothMs: 90        // scroll easing time constant (ms)
  };

  var section, stage, still, frame, sctx;
  var vw = 0, vh = 0, handPx = 0, albumPx = 0;
  var coverQuad = null;                 // album cover corners (stage px), reported by the album
  var cur = -1, target = 0, raf = 0, haveStill = false;
  var lastP = -1, lastState = '';

  /* ---------- geometry ---------- */
  function squareToQuad(q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1];
    var x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var den = dx1 * dy2 - dx2 * dy1;
    var g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
    return [[x1 - x0 + g * x1, x3 - x0 + h * x3, x0], [y1 - y0 + g * y1, y3 - y0 + h * y3, y0], [g, h, 1]];
  }
  function inv3(m) {
    var a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2], g = m[2][0], h = m[2][1], i = m[2][2];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  function mul3(p, q) {
    var r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) r[i][j] = p[i][0] * q[0][j] + p[i][1] * q[1][j] + p[i][2] * q[2][j];
    return r;
  }
  function css3(H) {
    return 'matrix3d(' + [H[0][0], H[1][0], 0, H[2][0], H[0][1], H[1][1], 0, H[2][1], 0, 0, 1, 0, H[0][2], H[1][2], 0, H[2][2]]
      .map(function (n) { return +n.toFixed(10); }).join(',') + ')';
  }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function lerpQuad(p, q, t) { return p.map(function (c, i) { return [c[0] + (q[i][0] - c[0]) * t, c[1] + (q[i][1] - c[1]) * t]; }); }

  // the book in the last frame, in stage px (same "cover" fit as the frames)
  function bookQuad() {
    var m = FS.frameToStage(OPTIONS.lastSeq);
    if (!m) return null;
    return OPTIONS.bookCorners.map(function (c) { return [m.x + c[0] * m.w, m.y + c[1] * m.h]; });
  }

  /* ---------- the held last frame ---------- */
  // Copy the main canvas while it shows the last frame, so the hand-off
  // starts from exactly the picture that is on screen.
  function grabStill(st) {
    if (!st || st.seq !== OPTIONS.lastSeq || st.frame !== OPTIONS.lastFrame || st.phase) return;
    var c = FS.canvas();
    if (!c || !c.width) return;
    if (still.width !== c.width || still.height !== c.height) { still.width = c.width; still.height = c.height; }
    sctx.drawImage(c, 0, 0);
    haveStill = true;
  }
  // fallback (e.g. the page was opened part-way down): draw the last frame
  function drawStillFromFrames() {
    var seq = null;
    FS.sequences.forEach(function (q) { if (q.key === OPTIONS.lastSeq) seq = q; });
    if (!seq) return;
    var i = seq.nearestLoaded(OPTIONS.lastFrame - 1);
    if (i !== OPTIONS.lastFrame - 1) { seq.startLoading(); return; }
    var f = seq.frames[i], c = FS.canvas();
    still.width = c.width; still.height = c.height;
    var sc = Math.max(c.width / f.sw, c.height / f.sh), dw = f.sw * sc, dh = f.sh * sc;
    sctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    haveStill = true;
  }

  /* ---------- scroll → progress ---------- */
  function sectionTop() { return section.getBoundingClientRect().top + window.scrollY; }
  function readTarget() { target = window.scrollY - sectionTop(); }

  function setState(s) {
    if (s !== lastState) { lastState = s; document.documentElement.setAttribute('data-album-state', s); }
  }
  function send(m) { try { frame.contentWindow.postMessage(m, '*'); } catch (e) {} }

  function render(y) {
    if (y < 0) {                                   // still in the frame animation
      stage.style.visibility = 'hidden';
      frame.style.pointerEvents = 'none';
      setState('ANIMATION');
      return;
    }
    stage.style.visibility = 'visible';
    if (!haveStill) drawStillFromFrames();
    var h = clamp01(y / handPx);
    var p = clamp01((y - handPx) / albumPx);

    // 1) hand-off: the held frame's book moves onto the album's cover,
    //    the album fades in over it
    var Qf = bookQuad();
    if (h < 1) send({ album: 'measure' });
    if (Qf && coverQuad) {
      var e = smooth(h);
      var H = mul3(squareToQuad(lerpQuad(Qf, coverQuad, e)), inv3(squareToQuad(Qf)));
      still.style.transform = css3(H);
    }
    still.style.visibility = h < 1 ? 'inherit' : 'hidden';
    // the swap happens once the two books are lined up (short, so the two
    // cover designs never sit on top of each other for long)
    var fade = smooth(clamp01((h - 0.55) / 0.3));
    frame.style.opacity = fade.toFixed(3);
    frame.style.pointerEvents = fade > 0.98 ? 'auto' : 'none';

    // 2) the album itself
    if (Math.abs(p - lastP) > 1e-5) { lastP = p; send({ album: 'progress', p: p }); }
    setState(h < 1 ? 'ALBUM_HANDOFF' : 'ALBUM');
  }

  var prevT = 0;
  function tick(now) {
    raf = 0;
    var dt = prevT ? Math.min(100, now - prevT) : 16; prevT = now;
    if (cur < -1e8) cur = target;
    var d = target - cur;
    // time-based easing (same feel at any frame rate)
    var k = 1 - Math.exp(-dt / OPTIONS.smoothMs);
    cur = Math.abs(d) < 0.5 ? target : cur + d * k;
    render(cur);
    if (cur !== target) raf = requestAnimationFrame(tick); else prevT = 0;
  }
  function kick() { readTarget(); if (!raf) raf = requestAnimationFrame(tick); }

  /* ---------- messages from the album ---------- */
  function onMessage(ev) {
    var d = ev.data;
    if (!d || d.album == null || ev.source !== frame.contentWindow) return;
    if (d.album === 'cover' && d.quad && d.quad.length === 4) {
      // the album fills the stage, so its px are stage px
      coverQuad = d.quad;
      if (cur >= 0 && cur < handPx) render(cur);
    } else if (d.album === 'wheel') {
      window.scrollBy(0, d.dy);
    } else if (d.album === 'goto') {
      window.scrollTo({ top: sectionTop() + handPx + d.p * albumPx, behavior: 'smooth' });
    } else if (d.album === 'ready') {
      lastP = -1; send({ album: 'measure' }); kick();
    }
  }

  /* ---------- setup ---------- */
  function size() {
    vw = stage.clientWidth; vh = stage.clientHeight;
    handPx = Math.round(OPTIONS.handoff * vh);
    albumPx = Math.round(OPTIONS.album * vh);
    section.style.setProperty('--album-scroll', (handPx + albumPx) + 'px');
    still.style.width = vw + 'px'; still.style.height = vh + 'px';
    haveStill = false;
    lastP = -1;
    send({ album: 'measure' });
    kick();
  }

  function init() {
    section = document.querySelector('.album-scroll');
    if (!section) return;
    stage = section.querySelector('.album-stage');
    still = section.querySelector('.album-stage__still');
    frame = section.querySelector('.album-stage__frame');
    sctx = still.getContext('2d', { alpha: false });
    FS.onRender(grabStill);
    size();
    cur = -1e9;
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', size);
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', function () { send({ album: 'measure' }); });
    kick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.AlbumSection = {
    options: OPTIONS,
    snap: function () { readTarget(); cur = target; render(cur); },
    state: function () { return { y: cur, handPx: handPx, albumPx: albumPx, cover: coverQuad, book: bookQuad(), still: haveStill }; }
  };
})();
