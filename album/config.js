/* =========================================================================
   ALBUM CONFIGURATION
   Edit this file to rearrange the album. Everything else reads from it.

   Book structure (4 leaves = 4 page turns):
     spread 1  = inside front cover (left)  + leaf 1 front (right)
     spread 2  = leaf 1 back (left)          + leaf 2 front (right)
     spread 3  = leaf 2 back (left)          + leaf 3 front (right)
     spread 4  = leaf 3 back (left)          + leaf 4 front (right)
     spread 5  = leaf 4 back (left)          + inside back cover (right)  ← closing spread

   Artwork fields
     src       file name inside ./assets/artwork/
     spread    1–5
     side      "left" | "right"
     x, y      top-left position, % of the page (page is 440 × 580 design px)
     w         width, % of the page width (height follows the image's aspect)
     rotation  degrees
     mount     "print" (white photo-print border) | "bare" (paper edge only)
     tape      list of pieces: "top" "bottom" "tl" "tr" "bl" "br" "left" "right"
     tapeType  "masking" | "clear" | "corners" (black photo corners; ignores tape list)
     curl      optional lifted corner: "tl" | "tr" | "bl" | "br"
     z         stacking order on the page (higher sits on top)
   ========================================================================= */

const ALBUM = {
  title: "Album",
  author: "Sachin S. Ballari",
};

const artworks = [
  /* ---------- SPREAD 1 · Faces ---------- */
  { src: "unnamed.jpg",                 spread: 1, side: "left",  x: 49, y: 37, w: 40, rotation: 2.4,  mount: "print", tapeType: "masking", tape: ["tl", "br"], z: 2 },
  { src: "IMG_20201123_095719.jpg",     spread: 1, side: "left",  x: 9,  y: 64, w: 40, rotation: -3,   mount: "bare",  tapeType: "clear",   tape: ["top"], curl: "br", z: 3 },

  { src: "IMG_20201220_095010.jpg",     spread: 1, side: "right", x: 11, y: 6,  w: 52, rotation: -1.8, mount: "print", tapeType: "masking", tape: ["tl", "tr"], z: 1 },
  { src: "IMG_20201220_095133.jpg",     spread: 1, side: "right", x: 57, y: 42, w: 35, rotation: 3.5,  mount: "bare",  tapeType: "corners", z: 3 },
  { src: "unnamed (1).jpg",             spread: 1, side: "right", x: 14, y: 66, w: 23, rotation: -4,   mount: "print", tapeType: "masking", tape: ["top"], z: 2 },

  /* ---------- SPREAD 2 · Studies ---------- */
  { src: "IMG-20201130-WA0057.jpg",     spread: 2, side: "left",  x: 8,  y: 7,  w: 52, rotation: -1.4, mount: "print", tapeType: "corners", z: 1 },
  { src: "IMG-20201130-WA0059.jpg",     spread: 2, side: "left",  x: 61, y: 12, w: 30, rotation: 4,    mount: "bare",  tapeType: "masking", tape: ["top"], z: 2 },
  { src: "IMG-20201130-WA0058.jpg",     spread: 2, side: "left",  x: 63, y: 40, w: 29, rotation: -3,   mount: "bare",  tapeType: "clear",   tape: ["left", "right"], curl: "bl", z: 3 },

  { src: "20210106_084752.jpg",         spread: 2, side: "right", x: 42, y: 6,  w: 48, rotation: 2,    mount: "print", tapeType: "masking", tape: ["tl", "br"], z: 2 },
  { src: "IMG-20201226-WA0009.jpg",     spread: 2, side: "right", x: 8,  y: 16, w: 35, rotation: -3.5, mount: "bare",  tapeType: "masking", tape: ["top"], z: 1 },
  { src: "unnamed (4).jpg",             spread: 2, side: "right", x: 28, y: 59, w: 33, rotation: 1.5,  mount: "print", tapeType: "clear",   tape: ["left"], curl: "tr", z: 3 },

  /* ---------- SPREAD 3 · Icons ---------- */
  { src: "20200928_133535.jpg",         spread: 3, side: "left",  x: 8,  y: 6,  w: 44, rotation: -2.5, mount: "bare",  tapeType: "corners", z: 1 },
  { src: "20201127_093759.jpg",         spread: 3, side: "left",  x: 53, y: 20, w: 38, rotation: 2,    mount: "print", tapeType: "masking", tape: ["tl", "tr"], z: 2 },
  { src: "20210106_085008.jpg",         spread: 3, side: "left",  x: 15, y: 55, w: 33, rotation: 1,    mount: "print", tapeType: "clear",   tape: ["top"], curl: "bl", z: 3 },

  { src: "20201201_082745.jpg",         spread: 3, side: "right", x: 44, y: 5,  w: 47, rotation: 2.2,  mount: "print", tapeType: "masking", tape: ["tr", "bl"], z: 2 },
  { src: "IMG_20201219_094434.jpg",     spread: 3, side: "right", x: 8,  y: 10, w: 33, rotation: -3,   mount: "bare",  tapeType: "corners", z: 1 },
  { src: "Screenshot_20220112-083925_WhatsApp.jpg", spread: 3, side: "right", x: 11, y: 55, w: 29, rotation: 2.5, mount: "bare", tapeType: "masking", tape: ["top"], z: 3 },
  { src: "unnamed (2).jpg",             spread: 3, side: "right", x: 51, y: 57, w: 30, rotation: -1.8, mount: "print", tapeType: "clear",   tape: ["right"], curl: "br", z: 3 },

  /* ---------- SPREAD 4 · Character ---------- */
  { src: "IMG_20201220_095406.jpg",     spread: 4, side: "left",  x: 8,  y: 5,  w: 42, rotation: -2,   mount: "print", tapeType: "masking", tape: ["tl", "tr"], z: 1 },
  { src: "IMG-20201127-WA0026.jpg",     spread: 4, side: "left",  x: 56, y: 9,  w: 35, rotation: 3,    mount: "bare",  tapeType: "corners", z: 2 },
  { src: "unnamed (5).jpg",             spread: 4, side: "left",  x: 58, y: 51, w: 27, rotation: -2.5, mount: "print", tapeType: "masking", tape: ["top"], z: 3 },
  { src: "unnamed.png",                 spread: 4, side: "left",  x: 22, y: 61, w: 25, rotation: 1.5,  mount: "bare",  tapeType: "clear",   tape: ["top"], curl: "br", z: 4 },

  { src: "++.jpg",                      spread: 4, side: "right", x: 46, y: 7,  w: 45, rotation: 2.5,  mount: "bare",  tapeType: "masking", tape: ["tl", "br"], z: 2 },
  { src: "unnamed (3).jpg",             spread: 4, side: "right", x: 9,  y: 12, w: 33, rotation: -3,   mount: "print", tapeType: "masking", tape: ["top"], z: 1 },
  { src: "unnamed (6).jpg",             spread: 4, side: "right", x: 52, y: 52, w: 36, rotation: -2,   mount: "print", tapeType: "clear",   tape: ["top"], curl: "bl", z: 3 },
  { src: "++++.jpg",                    spread: 4, side: "right", x: 13, y: 58, w: 27, rotation: 2,    mount: "bare",  tapeType: "corners", z: 3 },

  /* ---------- SPREAD 5 · Colour & close ---------- */
  { src: "IMG-20201130-WA0069.jpg",     spread: 5, side: "left",  x: 8,  y: 7,  w: 41, rotation: -2,   mount: "print", tapeType: "masking", tape: ["tl", "tr"], z: 1 },
  { src: "20210306_070933.jpg",         spread: 5, side: "left",  x: 52, y: 13, w: 39, rotation: 2.5,  mount: "bare",  tapeType: "corners", z: 2 },
  { src: "IMG-20201130-WA0068.jpg",     spread: 5, side: "left",  x: 28, y: 56, w: 31, rotation: -1,   mount: "print", tapeType: "masking", tape: ["top"], curl: "br", z: 3 },

  { src: "IMG_20230913_205123.jpg",     spread: 5, side: "right", x: 10, y: 9,  w: 54, rotation: -1.5, mount: "print", tapeType: "clear",   tape: ["top"], z: 1 },
  { src: "Screenshot_20220131-121059_Gallery.jpg", spread: 5, side: "right", x: 58, y: 34, w: 30, rotation: 3, mount: "bare", tapeType: "corners", z: 2 },
];

/* Printed / handwritten text. html is inserted as-is. */
const texts = [
  { spread: 1, side: "left",  x: 10, y: 9,  w: 60, cls: "t-kicker", html: "Drawings · 2020 — 2023" },
  { spread: 1, side: "left",  x: 10, y: 13, w: 60, cls: "t-title",  html: "Selected<br><em>Works</em>" },
  { spread: 1, side: "left",  x: 10, y: 33, w: 34, cls: "t-body",   html: "Graphite, charcoal and colour pencil on paper." },
  { spread: 1, side: "left",  x: 10, y: 41, w: 34, cls: "t-sign",   html: "Sachin S. Ballari" },
  { spread: 1, side: "right", x: 67, y: 27, w: 28, cls: "t-hand",   html: "after Dalí,<br>Dec 2020", rotation: -4 },

  { spread: 2, side: "left",  x: 12, y: 73, w: 46, cls: "t-hand",   html: "Mother Teresa — and two close studies", rotation: -2 },
  { spread: 3, side: "left",  x: 56, y: 70, w: 36, cls: "t-hand",   html: "portraits, 2020", rotation: 3 },
  { spread: 4, side: "right", x: 50, y: 44, w: 40, cls: "t-hand",   html: "colour + caricature", rotation: -2.5 },
  { spread: 5, side: "left",  x: 62, y: 66, w: 32, cls: "t-hand",   html: "in colour", rotation: 4 },
  { spread: 5, side: "right", x: 13, y: 34, w: 40, cls: "t-hand",   html: "on the desk, 2023", rotation: -2 },

  { spread: 5, side: "right", x: 10, y: 72, w: 46, cls: "t-colophon", html: "<span class='fin'>Fin.</span>Every drawing in this album was made by hand, from life and from photographs, between 2020 and 2023.<br><br><span class='sc'>Sachin S. Ballari</span>" },

  /* folios — numeral on the left page, theme on the right */
  { spread: 1, side: "right", cls: "t-folio right", html: "I · Faces" },
  { spread: 2, side: "left",  cls: "t-folio left",  html: "II" },
  { spread: 2, side: "right", cls: "t-folio right", html: "Studies" },
  { spread: 3, side: "left",  cls: "t-folio left",  html: "III" },
  { spread: 3, side: "right", cls: "t-folio right", html: "Icons" },
  { spread: 4, side: "left",  cls: "t-folio left",  html: "IV" },
  { spread: 4, side: "right", cls: "t-folio right", html: "Character" },
  { spread: 5, side: "left",  cls: "t-folio left",  html: "V" },
];

/* Scroll timeline (0 → 1 of the page scroll). Each phase is [start, end]. */
const TIMELINE = {
  open:  [0.035, 0.150],
  turns: [
    [0.245, 0.345],   // page turn 1 : spread 1 → 2
    [0.435, 0.535],   // page turn 2 : spread 2 → 3
    [0.625, 0.725],   // page turn 3 : spread 3 → 4
    [0.800, 0.875],   // page turn 4 : spread 4 → closing spread
  ],
  close: [0.915, 0.990],
};
