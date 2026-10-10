/* ==================================================================
   Scroll-controlled frame sequences — one continuous timeline
   ------------------------------------------------------------------
   Three frame sequences play back to back on ONE pinned canvas, so
   there is no gap between them:

     Section 1 -> ../Frames/1/   (300 frames)
     Section 2 -> ../Frames/2/   (300 frames)
     Section 3 -> ../Frames/3/   (136 frames)

   STRICT MAPPING: each section shows only frames from its own folder.
   The folders are listed explicitly below (no directory scanning).
   Frame URLs are generated numerically (001, 002 … 300), so the order
   is always the true frame order, never alphabetical.

   Optional: define window.FRAME_SCROLL_CONFIG before this script to
   override SEQUENCES (e.g. a hosted build that packs frames into
   sprite sheets via a `sheet` setting). Not needed locally.

   Pause points: FrameScroll.setPause(key, {...}) inserts a stop inside
   a sequence (used by js/laptop-screen.js to enter the laptop screen).
   FrameScroll.onRender(fn) reports what is on screen after every draw.
   ================================================================== */
(function () {
  'use strict';

  var SEQUENCES = {
    1: { folder: '../Frames/1/', prefix: 'ezgif-frame-', digits: 3, ext: '.jpg', count: 300 },
    2: { folder: '../Frames/2/', prefix: 'ezgif-frame-', digits: 3, ext: '.jpg', count: 300 },
    3: { folder: '../Frames/3/', prefix: 'ezgif-frame-', digits: 3, ext: '.jpg', count: 136 }
  };
  if (window.FRAME_SCROLL_CONFIG) SEQUENCES = window.FRAME_SCROLL_CONFIG;

  var SETTINGS = {
    // 0–1. How quickly the animation catches up to the scroll position.
    // 1 = locked to scroll; lower = smoother, more "cinematic".
    smoothing: 0.18,
    // Cap canvas resolution on high-DPI screens to keep things light.
    maxPixelRatio: 2,
    // Parallel image requests while preloading.
    concurrency: 6,
    // Start loading a sequence this far before its section is reached.
    preloadMargin: '150% 0px'
  };

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    SETTINGS.smoothing = 1;
  }

  function pad(n, digits) {
    var s = String(n);
    while (s.length < digits) s = '0' + s;
    return s;
  }

  function frameUrl(cfg, i) { // i is 0-based
    return cfg.folder + cfg.prefix + pad(i + 1, cfg.digits) + cfg.ext;
  }

  // Optional sprite-sheet mode: cfg.sheet = { prefix, digits, ext,
  // perSheet, cols }. Frames are packed left-to-right, top-to-bottom,
  // in true frame order, perSheet frames per file.
  function sheetUrl(cfg, s) { // s is 0-based
    var sh = cfg.sheet;
    return cfg.folder + sh.prefix + pad(s + 1, sh.digits) + sh.ext;
  }

  // Load order that fills the timeline coarsely first (every 32nd file,
  // then every 16th, …) so scrubbing works early while the rest arrives.
  function progressiveOrder(count) {
    var order = [], seen = new Uint8Array(count);
    for (var step = 32; step >= 1; step = step / 2) {
      for (var i = 0; i < count; i += step) {
        if (!seen[i]) { seen[i] = 1; order.push(i); }
      }
    }
    if (!seen[count - 1]) order.splice(1, 0, count - 1);
    return order;
  }

  /* ---------------- One sequence (frames + loading only) ---------------- */

  function FrameSequence(section, cfg, start) {
    this.section = section;
    this.cfg = cfg;
    this.start = start;                   // first index on the global timeline
    this.frames = new Array(cfg.count);   // {img, sx, sy, sw, sh} | undefined
    this.loaded = new Uint8Array(cfg.count);
    this.loadingStarted = false;
    this.onFrame = null;
  }

  FrameSequence.prototype.startLoading = function () {
    if (this.loadingStarted) return;
    this.loadingStarted = true;

    var self = this;
    var cfg = this.cfg;
    var per = cfg.sheet ? cfg.sheet.perSheet : 1;
    var units = Math.ceil(cfg.count / per);   // files to load
    var queue = progressiveOrder(units);
    var active = 0;

    function next() {
      while (active < SETTINGS.concurrency && queue.length) {
        load(queue.shift());
      }
    }

    function load(u) {
      active++;
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        if (!cfg.sheet) {
          self.frames[u] = { img: img, sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
          self.loaded[u] = 1;
        } else {
          var cols = cfg.sheet.cols;
          var rows = Math.ceil(per / cols);
          var fw = img.naturalWidth / cols, fh = img.naturalHeight / rows;
          for (var k = 0; k < per; k++) {
            var i = u * per + k;
            if (i >= cfg.count) break;
            self.frames[i] = { img: img, sx: (k % cols) * fw, sy: Math.floor(k / cols) * fh, sw: fw, sh: fh };
            self.loaded[i] = 1;
          }
        }
        active--;
        if (self.onFrame) self.onFrame();
        next();
      };
      img.onerror = function () {
        active--;
        if (window.console) console.warn('[frame-scroll] missing frame:', img.src);
        next();
      };
      img.src = cfg.sheet ? sheetUrl(cfg, u) : frameUrl(cfg, u);
    }

    next();
  };

  // Closest loaded frame WITHIN THIS SEQUENCE (never another sequence's).
  FrameSequence.prototype.nearestLoaded = function (i) {
    if (this.loaded[i]) return i;
    for (var d = 1; d < this.cfg.count; d++) {
      if (i - d >= 0 && this.loaded[i - d]) return i - d;
      if (i + d < this.cfg.count && this.loaded[i + d]) return i + d;
    }
    return -1;
  };

  /* ---------------- Player: one canvas, one timeline ---------------- */

  var root, canvas, ctx;
  var sequences = [];
  var total = 0;           // total frames across all sequences
  var targetY = 0;         // scroll position inside the player (px)
  var currentY = 0;        // smoothed scroll position (px)
  var drawnSeq = null, drawnIdx = -1;
  var rafId = 0;
  var pauses = {};         // key -> { enterFrame, exitFrame, enterPx, exitPx }
  var listeners = [];
  var lastState = null;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, SETTINGS.maxPixelRatio);
    var w = Math.round(canvas.clientWidth * dpr);
    var h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      drawnIdx = -1; // force redraw at new size
    }
  }

  // Section boundaries in px from the top of the player.
  function layout() {
    var vh = window.innerHeight;
    var rootRect = root.getBoundingClientRect();
    var end = rootRect.height - vh;                       // px when the stage unpins
    var out = [];
    for (var i = 0; i < sequences.length; i++) {
      var top = sequences[i].section.getBoundingClientRect().top - rootRect.top;
      var bottom = (i < sequences.length - 1)
        ? sequences[i + 1].section.getBoundingClientRect().top - rootRect.top
        : end;
      out.push({ seq: sequences[i], top: top, bottom: bottom });
    }
    return out;
  }

  // Scroll position (px into the player) -> what to show.
  // Each section plays its own sequence from first to last frame; the next
  // section starts exactly where the previous one ends. A section with a
  // pause point plays frames 1..enterFrame, then an "enter" stretch, the
  // pause itself, an "exit" stretch, then frames exitFrame..last.
  function stateAt(y) {
    var L = layout();
    for (var i = 0; i < L.length; i++) {
      var seg = L[i];
      if (y >= seg.bottom && i < L.length - 1) continue;
      var s = seg.seq, n = s.cfg.count;
      var len = Math.max(1, seg.bottom - seg.top);
      var d = Math.max(0, Math.min(len, y - seg.top));
      var pz = pauses[s.key];
      if (!pz) return { seq: s, pos: d / len * (n - 1), phase: null, amount: 0 };

      var rest = Math.max(1, len - pz.enterPx - pz.exitPx);
      var before = (pz.enterFrame - 1), after = (n - pz.exitFrame);
      var pre = rest * before / Math.max(1, before + after);
      if (d < pre) return { seq: s, pos: d / Math.max(1, pre) * (pz.enterFrame - 1), phase: null, amount: 0 };
      d -= pre;
      if (d < pz.enterPx) return { seq: s, pos: pz.enterFrame - 1, phase: 'enter', amount: d / pz.enterPx };
      d -= pz.enterPx;
      if (d < pz.exitPx) return { seq: s, pos: pz.exitFrame - 1, phase: 'exit', amount: 1 - d / pz.exitPx };
      d -= pz.exitPx;
      var post = Math.max(1, rest - pre);
      return { seq: s, pos: (pz.exitFrame - 1) + Math.min(1, d / post) * (n - pz.exitFrame), phase: null, amount: 0 };
    }
    return null;
  }

  function scrolledY() { return -root.getBoundingClientRect().top; }

  function draw(st) {
    if (!st) return;
    var seq = st.seq;
    var want = Math.max(0, Math.min(seq.cfg.count - 1, Math.round(st.pos)));
    var idx = seq.nearestLoaded(want);
    if (idx < 0) {
      // This sequence has nothing loaded yet: make sure it is loading and
      // keep the last drawn frame on screen rather than another folder's.
      seq.startLoading();
    } else if (seq !== drawnSeq || idx !== drawnIdx) {
      var f = seq.frames[idx];
      var cw = canvas.width, ch = canvas.height;
      // "cover" fit — preserve aspect ratio, crop overflow, centre.
      var scale = Math.max(cw / f.sw, ch / f.sh);
      var dw = f.sw * scale, dh = f.sh * scale;
      ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      drawnSeq = seq;
      drawnIdx = idx;
    }
    lastState = {
      seq: drawnSeq ? drawnSeq.key : null,
      frame: drawnIdx + 1,               // 1-based frame actually on the canvas
      phase: st.phase,                   // null | 'enter' | 'exit'
      amount: st.amount                  // 0–1 progress into the pause point
    };
    for (var i = 0; i < listeners.length; i++) listeners[i](lastState);
  }

  function tick() {
    rafId = 0;
    targetY = scrolledY();
    var diff = targetY - currentY;
    if (Math.abs(diff) < 0.5) currentY = targetY;
    else currentY += diff * SETTINGS.smoothing;
    draw(stateAt(currentY));
    if (currentY !== targetY) requestFrame();
  }

  function requestFrame() {
    if (!rafId) rafId = window.requestAnimationFrame(tick);
  }

  function init() {
    root = document.querySelector('.frame-scroll');
    if (!root) return;
    canvas = root.querySelector('.frame-scroll__canvas');
    ctx = canvas.getContext('2d', { alpha: false });

    var sections = root.querySelectorAll('.frame-seq[data-seq]');
    for (var i = 0; i < sections.length; i++) {
      var key = sections[i].getAttribute('data-seq');
      var cfg = SEQUENCES[key];
      if (!cfg) {
        if (window.console) console.warn('[frame-scroll] no sequence configured for data-seq="' + key + '"');
        continue;
      }
      var seq = new FrameSequence(sections[i], cfg, total);
      seq.key = key;
      seq.onFrame = function () { drawnIdx = -1; draw(stateAt(currentY)); };
      sequences.push(seq);
      total += cfg.count;
    }
    if (!sequences.length) return;

    resize();

    // Load each sequence only when its section is getting close.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          sequences.forEach(function (s) {
            if (s.section === entry.target) { s.startLoading(); io.unobserve(entry.target); }
          });
        });
      }, { rootMargin: SETTINGS.preloadMargin });
      sequences.forEach(function (s) { io.observe(s.section); });
    } else {
      sequences.forEach(function (s) { s.startLoading(); });
    }

    // Start at the current scroll position (e.g. reload mid-page)
    // without easing in from frame 0.
    currentY = targetY = scrolledY();

    window.addEventListener('scroll', requestFrame, { passive: true });
    window.addEventListener('resize', function () { resize(); drawnIdx = -1; requestFrame(); });
    requestFrame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function seqByKey(key) {
    for (var i = 0; i < sequences.length; i++) if (sequences[i].key === key) return sequences[i];
    return null;
  }

  // Public API (used by js/laptop-screen.js; handy for debugging).
  window.FrameScroll = {
    sequences: sequences,
    settings: SETTINGS,
    config: SEQUENCES,
    root: function () { return root; },
    canvas: function () { return canvas; },
    // Insert / update a pause point inside sequence `key`:
    //   enterFrame: last frame before the pause, exitFrame: first after it,
    //   enterPx / exitPx: scroll distance of the stretches into/out of it.
    setPause: function (key, p) { pauses[key] = p; requestFrame(); },
    // Page scroll Y (document px) at the exact pause point of `key`.
    pauseScrollY: function (key) {
      var pz = pauses[key]; if (!pz || !root) return null;
      var L = layout();
      for (var i = 0; i < L.length; i++) {
        if (L[i].seq.key !== key) continue;
        var n = L[i].seq.cfg.count, len = L[i].bottom - L[i].top;
        var rest = Math.max(1, len - pz.enterPx - pz.exitPx);
        var before = pz.enterFrame - 1, after = n - pz.exitFrame;
        var y = L[i].top + rest * before / Math.max(1, before + after) + pz.enterPx;
        return y + (window.scrollY + root.getBoundingClientRect().top);
      }
      return null;
    },
    onRender: function (fn) { listeners.push(fn); if (lastState) fn(lastState); },
    state: function () { return lastState; },
    // Normalised frame coords (0–1) -> stage CSS px, for the cover fit.
    frameToStage: function (key) {
      var s = seqByKey(key); if (!s || !canvas) return null;
      var f = s.frames[s.nearestLoaded(0)] || null;
      var aspect = f ? f.sw / f.sh : 16 / 9;
      var cw = canvas.clientWidth, ch = canvas.clientHeight;
      var fw = Math.max(cw, ch * aspect), fh = fw / aspect;
      return { x: (cw - fw) / 2, y: (ch - fh) / 2, w: fw, h: fh };
    },
    refresh: function () { drawnIdx = -1; requestFrame(); },
    // Jump straight to the current scroll position without playing the
    // frames in between (used by the navigation links).
    snap: function () { if (!root) return; currentY = targetY = scrolledY(); drawnIdx = -1; draw(stateAt(currentY)); }
  };
})();
