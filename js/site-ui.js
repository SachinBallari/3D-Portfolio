/* ==================================================================
   Site UI — navigation, landing text, chapter text, scroll guide and
   colour mode. Text fades in and out with the frames it belongs to
   (it reads window.FrameScroll), so it is always in sync with the
   animation, forwards and backwards.

   Nav bar: shown on the landing page; everywhere else it stays out of
   the way and slides in when the pointer reaches the top edge.

   Scroll guide: while you approach the laptop, the camera, or read the
   album, a slim bar at the right edge shows how far you are from the
   point where it is entered (or, in the album, which spread you are on).
   ================================================================== */
(function () {
  'use strict';

  // Link for the "View my main portfolio" button in the nav bar.
  // Paste the address here when it is ready, e.g. 'https://example.com/'.
  var MAIN_PORTFOLIO_URL = 'https://sachin-ballari-portfolio-2026.vercel.app/';

  var FS = window.FrameScroll;
  var root = document.documentElement;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

  /* ---------- colour mode (remembered on this device) ---------- */
  function setMode(m) {
    if (m !== 'light') m = 'dark';
    root.setAttribute('data-mode', m);
    var t = document.querySelector('.mode-toggle');
    if (t) {
      t.setAttribute('aria-pressed', m === 'light' ? 'true' : 'false');
      t.setAttribute('aria-label', m === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
      t.title = t.getAttribute('aria-label');
    }
    store('fs-mode', m);
  }

  /* ---------- where things are on the scroll ---------- */
  function sectionOf(key) { return document.querySelector('.frame-seq[data-seq="' + key + '"]'); }
  function docTop(el) { return el.getBoundingClientRect().top + window.scrollY; }
  function sectionSpan(key) {
    var s = sectionOf(key), next = s && s.nextElementSibling;
    var top = docTop(s);
    var bottom = next && next.classList.contains('frame-seq') ? docTop(next)
      : docTop(FS.root()) + FS.root().offsetHeight - window.innerHeight;
    return { top: top, len: bottom - top };
  }
  function pauseOf(key) {
    if (key === '2' && window.LaptopScreen) return LaptopScreen.pause();
    if (key === '3' && window.CameraScreen) return CameraScreen.pause();
    return null;
  }
  // Scroll Y (document px) where `frame` of a sequence is on screen.
  function frameY(key, frame) {
    var sp = sectionSpan(key), n = FS.config[key].count, pz = pauseOf(key);
    if (!pz) return sp.top + sp.len * (frame - 1) / Math.max(1, n - 1);
    var rest = Math.max(1, sp.len - pz.enterPx - pz.exitPx);
    var before = pz.enterFrame - 1, after = n - pz.exitFrame;
    var pre = rest * before / Math.max(1, before + after);
    if (frame <= pz.enterFrame) return sp.top + pre * (frame - 1) / Math.max(1, before);
    return sp.top + pre + pz.enterPx + pz.exitPx + (rest - pre) * (frame - pz.exitFrame) / Math.max(1, after);
  }
  function albumSpan() {
    var a = document.querySelector('.album-scroll'), st = window.AlbumSection && AlbumSection.state();
    if (!a || !st) return null;
    return { top: docTop(a), hand: st.handPx, len: st.albumPx };
  }
  function targetY(name) {
    var p, al;
    switch (name) {
      case 'top': return 0;
      case 'about': return frameY('1', 190);
      case 'work': p = pauseOf('2'); return p ? FS.pauseScrollY('2') - p.enterPx - 2 : 0;
      case 'photography': p = pauseOf('3'); return p ? FS.pauseScrollY('3') - p.enterPx - 2 : 0;
      case 'art': al = albumSpan(); return al ? al.top + al.hand + 4 : 0;
      case 'contact': var c = document.getElementById('contact'); return c ? docTop(c) : 0;
    }
    return 0;
  }

  /* ---------- jumps from the nav bar ---------- */
  // While jumping, the laptop and camera do not catch the scroll on the way.
  var jumpingUntil = 0;
  // Navigation goes straight to its place: no frames play in between
  // (the animation only runs while scrolling).
  function jumpTo(name) {
    var y = Math.max(0, Math.round(targetY(name)));
    if (window.LaptopScreen && LaptopScreen.isLocked()) LaptopScreen.exit(0);
    if (window.CameraScreen && CameraScreen.isLocked()) CameraScreen.exit(0);
    jumpingUntil = performance.now() + 400;
    window.scrollTo({ top: y, behavior: 'instant' });
    var snap = function () {
      if (FS && FS.snap) FS.snap();
      if (window.AlbumSection && AlbumSection.snap) AlbumSection.snap();
    };
    snap();
    requestAnimationFrame(function () { snap(); requestAnimationFrame(snap); });
  }
  window.addEventListener('scroll', function () {
    if (jumpingUntil && performance.now() < jumpingUntil) jumpingUntil = Math.max(jumpingUntil, performance.now() + 150);
  }, { passive: true });

  /* ---------- frame-synced text ---------- */
  var SHOW = {
    landing:     [['1', 1, 14]],
    about:       [['1', 128, 250]],
    work:        [['2', 30, 79]],
    photography: [['2', 236, 300], ['3', 1, 6]],
    art:         [['3', 96, 136]]
  };
  var els = {};
  function inRange(st, list) {
    if (!st || st.phase) return false;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (st.seq === r[0] && st.frame >= r[1] && st.frame <= r[2]) return true;
    }
    return false;
  }
  function albumOn() { return (root.getAttribute('data-album-state') || 'ANIMATION') !== 'ANIMATION'; }
  function currentSection(st) {
    var c = document.getElementById('contact');
    if (c && c.getBoundingClientRect().top < window.innerHeight * 0.5) return 'contact';
    if (albumOn()) return 'art';
    if (!st) return null;
    if (st.seq === '3' && st.frame > 40) return 'art';
    if (st.seq === '3' || (st.seq === '2' && st.frame > 200)) return 'photography';
    if (st.seq === '2') return 'work';
    if (st.seq === '1' && st.frame > 60) return 'about';
    return null;
  }

  /* ---------- nav bar visibility ---------- */
  var onLanding = true, hovering = false, hoverTimer = 0;
  function setHover(v) {
    clearTimeout(hoverTimer);
    if (v) { hovering = true; syncNav(); }
    else hoverTimer = setTimeout(function () { hovering = false; syncNav(); }, 350);
  }
  function syncNav() { root.classList.toggle('nav-show', onLanding || hovering); }

  /* ---------- scroll guide ---------- */
  var ICONS = {
    laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 8h4l2-2.5h6L17 8h4v11H3z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    album: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6z"/><path d="M12 6v14.5"/></svg>'
  };
  // resting places of the album's spreads (album progress), from its own index
  var SPREADS = [0.2, 0.39, 0.58, 0.763, 0.895];
  var guide, gFill, gTicks, gTarget, gLabel, gIcon, gKind = '';

  function guideFor(y, st) {
    var vh = window.innerHeight;
    if (root.classList.contains('frame-scroll-locked')) return null;
    // album
    var al = albumSpan();
    if (al && y >= al.top - 2) return null;   // no guide over the album (it has its own index)
    if (false && al && y >= al.top - 2 && y <= al.top + al.hand + al.len + vh * 0.2) {
      var p = clamp01((y - al.top - al.hand) / al.len);
      var spread = 0;
      for (var i = 0; i < SPREADS.length; i++) if (p >= SPREADS[i] - 0.04) spread = i + 1;
      var label = y < al.top + al.hand ? 'Scroll to open the album'
        : spread === 0 ? 'Opening the album'
        : p > 0.985 ? 'The end — scroll on to say hello'
        : 'Spread <b>' + spread + '</b> of 5';
      return { kind: 'album', p: p, ticks: SPREADS, there: p > 0.985, label: label };
    }
    if (!st || st.phase === 'exit') return null;
    // laptop / camera approach: from the first close view to the moment it is entered
    var devs = [
      { kind: 'laptop', key: '2', from: frameY('2', 30), name: 'the laptop' },
      { kind: 'camera', key: '3', from: frameY('2', 236), name: 'the camera' }
    ];
    for (var d = 0; d < devs.length; d++) {
      var dv = devs[d], to = FS.pauseScrollY(dv.key);
      if (to == null || y < dv.from || y > to + 2) continue;
      if (dv.key === '2' && st.seq !== '2') continue;
      var q = clamp01((y - dv.from) / (to - dv.from));
      return {
        kind: dv.kind, p: q, ticks: [], there: q > 0.995,
        label: 'Scroll into ' + dv.name
      };
    }
    return null;
  }

  function renderGuide(g) {
    if (!guide) return;
    guide.classList.toggle('is-on', !!g);
    if (!g) return;
    guide.classList.toggle('is-left', g.kind === 'album');
    if (g.kind !== gKind) {
      gKind = g.kind;
      gIcon.innerHTML = ICONS[g.kind];
      gTicks.innerHTML = g.ticks.map(function (t) { return '<i class="ui-guide__tick" style="top:' + (t * 100).toFixed(1) + '%"></i>'; }).join('');
    }
    gFill.style.height = (g.p * 100).toFixed(2) + '%';
    guide.classList.toggle('is-there', g.there);
    if (gLabel.innerHTML !== g.label) gLabel.innerHTML = g.label;
  }

  /* ---------- per-frame update ---------- */
  var lastSt = null;
  function update(st) {
    if (st) lastSt = st; else st = lastSt;
    var y = window.scrollY;
    var locked = root.classList.contains('frame-scroll-locked');
    Object.keys(SHOW).forEach(function (k) {
      var on = !albumOn() && !locked && inRange(st, SHOW[k]);
      if (k !== 'landing' && tour && st && st.phase) on = false;
      if (k === 'landing' && y < 4) on = true;
      if (els[k]) els[k].classList.toggle('is-on', on);
    });
    onLanding = !!(els.landing && els.landing.classList.contains('is-on'));
    syncNav();
    var cur = currentSection(st);
    document.querySelectorAll('.site-nav__links a').forEach(function (a) {
      var isCur = a.dataset.go === cur;
      a.classList.toggle('is-current', isCur);
      if (isCur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    renderGuide(tour ? null : guideFor(y, st));
    syncPixels(st);
    placeInd();
  }


  /* ---------- auto tour ----------
     Started by the slide-to-start control on the landing page. Scrolls
     the whole page by itself — about, into the laptop, into the camera,
     every album spread, then the footer — holding at each stop. Any
     wheel, key, click or touch from the visitor (or the Stop button)
     hands control straight back. */
  var tour = null;
  function easeIO(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function tourStops() {
    var vh = window.innerHeight, stops = [], al = albumSpan(), c = document.getElementById('contact');
    stops.push({ y: frameY('1', 190), hold: 1000 });
    if (FS.pauseScrollY('2') != null) stops.push({ y: FS.pauseScrollY('2'), hold: 1000 });
    if (FS.pauseScrollY('3') != null) stops.push({ y: FS.pauseScrollY('3'), hold: 1000 });
    if (al) {
      stops.push({ y: al.top + al.hand, hold: 1000 });
      [0.2, 0.39, 0.58, 0.763, 0.895].forEach(function (p) { stops.push({ y: al.top + al.hand + p * al.len, hold: 1000 }); });
      stops.push({ y: al.top + al.hand + al.len, hold: 1000 });
    }
    if (c) stops.push({ y: docTop(c), hold: 0 });
    return stops;
  }
  function tourOn() { return !!tour; }
  function stopTour() {
    if (!tour) return;
    cancelAnimationFrame(tour.raf);
    tour = null;
    root.classList.remove('is-touring');
    var t = document.querySelector('[data-tour]'); if (t) t.classList.remove('is-on');
    jumpingUntil = performance.now() + 300;
  }
  function startTour() {
    stopTour();
    if (window.LaptopScreen && LaptopScreen.isLocked()) LaptopScreen.exit(0);
    if (window.CameraScreen && CameraScreen.isLocked()) CameraScreen.exit(0);
    var stops = tourStops(), speed = window.innerHeight * 0.7;   // px per second while moving
    tour = { i: 0, from: window.scrollY, t0: performance.now(), holdUntil: 0, raf: 0 };
    root.classList.add('is-touring');
    var t = document.querySelector('[data-tour]'); if (t) t.classList.add('is-on');
    function seg() {
      var st = stops[tour.i], d = Math.abs(st.y - tour.from);
      return Math.max(900, d / speed * 1000);
    }
    var dur = seg();
    function step(now) {
      if (!tour) return;
      var st = stops[tour.i];
      if (tour.holdUntil) {
        if (now < tour.holdUntil) { tour.raf = requestAnimationFrame(step); return; }
        tour.holdUntil = 0; tour.i++;
        if (tour.i >= stops.length) { stopTour(); return; }
        tour.from = window.scrollY; tour.t0 = now; dur = seg();
        st = stops[tour.i];
      }
      var k = Math.min(1, (now - tour.t0) / dur);
      window.scrollTo(0, Math.round(tour.from + (st.y - tour.from) * easeIO(k)));
      if (k >= 1) tour.holdUntil = now + st.hold;
      tour.raf = requestAnimationFrame(step);
    }
    tour.raf = requestAnimationFrame(step);
  }
  function wireTourStops() {
    var stopIf = function (e) {
      if (!tour) return;
      if (e.target && e.target.closest && e.target.closest('[data-tour]')) return;
      stopTour();
    };
    window.addEventListener('wheel', stopIf, { passive: true, capture: true });
    window.addEventListener('touchstart', stopIf, { passive: true, capture: true });
    window.addEventListener('mousedown', stopIf, true);
    window.addEventListener('keydown', stopIf, true);
    window.addEventListener('message', function (ev) {   // scrolling inside a device screen or the album
      var d = ev.data; if (tour && d && (d.frameScroll === 'wheel' || d.album === 'wheel')) stopTour();
    });
    var b = document.querySelector('.ui-tour__stop');
    if (b) b.addEventListener('click', stopTour);
  }

  /* ---------- slide to start ---------- */
  function wireSlider() {
    var el = document.querySelector('[data-slide]');
    if (!el) return;
    var knob = el.querySelector('.ui-slide__knob'), fill = el.querySelector('.ui-slide__fill');
    var x = 0, max = 0, startX = 0, dragging = false, done = false;
    el.classList.add('is-hint');
    function measure() { max = el.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft; }
    function set(v) {
      x = Math.max(0, Math.min(max, v));
      knob.style.transform = 'translateX(' + x + 'px)';
      fill.style.width = (x + knob.offsetWidth + 2 * knob.offsetLeft) + 'px';
      el.querySelector('.ui-slide__label').style.opacity = String(1 - Math.min(1, x / (max * 0.6)));
    }
    function complete() {
      measure(); done = true;
      el.classList.add('is-snap', 'is-done'); el.classList.remove('is-hint');
      set(max);
      setTimeout(startTour, 380);
    }
    function reset() {
      done = false;
      el.classList.add('is-snap'); el.classList.remove('is-done');
      set(0);
      el.querySelector('.ui-slide__label').style.opacity = '';
    }
    el.addEventListener('pointerdown', function (e) {   // grab anywhere on the slider
      if (done) return;
      measure(); dragging = true; startX = e.clientX - x;
      el.classList.remove('is-snap', 'is-hint');
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) { if (dragging) set(e.clientX - startX); });
    function end() {
      if (!dragging) return;
      dragging = false;
      if (x > max * 0.82) complete(); else { el.classList.add('is-snap'); set(0); el.querySelector('.ui-slide__label').style.opacity = ''; }
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    knob.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (!done) complete(); }
    });
    // ready again once the visitor is back at the start and no tour is running
    window.addEventListener('scroll', function () { if (done && !tour && window.scrollY < 4) reset(); }, { passive: true });
    setInterval(function () { if (done && !tour && window.scrollY < 4) reset(); }, 1000);
  }

  /* ---------- nav highlight that slides between links ---------- */
  var navInd = null, navHover = null;
  function placeInd() {
    if (!navInd) return;
    var a = navHover || document.querySelector('.site-nav__links a.is-current');
    if (!a) { navInd.style.opacity = '0'; return; }
    navInd.style.opacity = '1';
    navInd.style.width = a.offsetWidth + 'px';
    navInd.style.transform = 'translateX(' + a.offsetLeft + 'px)';
  }

  /* ---------- pixel layer ---------- */
  var pixels = null;
  function syncPixels(st) {
    if (!pixels) return;
    var c = document.getElementById('contact');
    var off = root.classList.contains('frame-scroll-locked') ||
      (st && st.phase && (st.seq === '2' || st.seq === '3')) ||
      (c && c.getBoundingClientRect().top < window.innerHeight);
    pixels.classList.toggle('is-off', !!off);
  }

  /* ---------- setup ---------- */
  function init() {
    pixels = document.querySelector('.ui-pixels');
    navInd = document.querySelector('.site-nav__ind');
    document.querySelectorAll('.site-nav__links a').forEach(function (a) {
      a.addEventListener('mouseenter', function () { navHover = a; placeInd(); });
      a.addEventListener('mouseleave', function () { navHover = null; placeInd(); });
    });
    wireSlider();
    var mp = document.querySelector('.site-nav__cta');
    if (mp) {
      if (MAIN_PORTFOLIO_URL) { mp.href = MAIN_PORTFOLIO_URL; mp.target = '_blank'; mp.rel = 'noopener'; }
      else { mp.setAttribute('aria-disabled', 'true'); mp.title = 'Link coming soon'; mp.addEventListener('click', function (e) { e.preventDefault(); }); }
    }
    wireTourStops();
    setMode(store('fs-mode') || 'dark');
    document.querySelectorAll('[data-show]').forEach(function (el) { els[el.dataset.show] = el; });

    guide = document.querySelector('[data-guide]');
    if (guide) {
      gFill = guide.querySelector('.ui-guide__fill');
      gTicks = guide.querySelector('.ui-guide__ticks');
      gTarget = guide.querySelector('.ui-guide__target');
      gLabel = guide.querySelector('.ui-guide__label');
      gIcon = guide.querySelector('.ui-guide__icon');
    }

    var mt = document.querySelector('.mode-toggle');
    if (mt) mt.addEventListener('click', function () { setMode(root.getAttribute('data-mode') === 'light' ? 'dark' : 'light'); });

    document.querySelectorAll('[data-go]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        stopTour();
        jumpTo(a.dataset.go, a.dataset.smooth === 'true');
      });
    });

    // nav bar: comes in at the top edge, stays while the pointer is on it
    var zone = document.querySelector('.site-nav-zone'), nav = document.querySelector('.site-nav');
    if (zone) zone.addEventListener('mouseenter', function () { setHover(true); });
    if (nav) {
      nav.addEventListener('mouseenter', function () { setHover(true); });
      nav.addEventListener('mouseleave', function () { setHover(false); });
    }
    window.addEventListener('mousemove', function (e) {
      if (e.clientY < 24) setHover(true);
      else if (hovering && e.clientY > 110 && !(nav && nav.matches(':hover'))) setHover(false);
    }, { passive: true });

    if (FS) FS.onRender(update);
    window.addEventListener('scroll', function () { update(null); }, { passive: true });
    window.addEventListener('resize', function () { gKind = ''; update(null); });
    new MutationObserver(function () { update(null); }).observe(root, { attributes: true, attributeFilter: ['class', 'data-album-state'] });
    update(FS && FS.state());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.SiteUI = {
    jumping: function () { return !!tour || performance.now() < jumpingUntil; },
    startTour: function () { startTour(); },
    stopTour: function () { stopTour(); },
    touring: function () { return !!tour; },
    setMode: setMode,
    jumpTo: jumpTo
  };
})();
