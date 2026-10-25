// Wears a Cursors pack on this page: the pack's arrow everywhere, its hand on links and buttons and its beam in
// text fields. Browsers can't play Windows .ani cursors, so animated packs are played here by stepping a CSS
// variable through their PNG frames at the timings the pack itself sets. The packs are in js/packs.js.
(() => {
  const PACKS = window.CURSOR_PACKS || [];
  const VIBES = ['Animated', 'Kawaii', 'Neon', 'Retro and games', 'Clean'];
  const ROLES = { arrow: ['--cur-arrow', 'auto'], link: ['--cur-link', 'pointer'], text: ['--cur-text', 'text'] };
  // the page's accent while a pack is worn, picked from each pack's own colours
  const TINTS = {
    plasma: '#4F8CFF', fire: '#FF6A00', glitch: '#FF2A6D', psychedelic: '#B45CF6', rainbow: '#FACC15', bee: '#FACC15',
    bear: '#C8A27A', bunny: '#F9A8D4', banana: '#FACC15', mocha: '#CBA6F7', magenta: '#FF2BD6', bluefire: '#22D3EE',
    purple: '#C026D3', pixel: '#9CA3AF', terminal: '#22C55E', steampunk: '#C08A2E', space: '#8B5CF6', macos: '#9CA3AF', ghost: '#9CA3AF',
  };
  const PIXEL_ART = new Set(['pixel', 'terminal', 'bear', 'bunny', 'space', 'glitch']);
  const STORE = 'cursors-pack';

  const root = document.documentElement;
  const body = document.body;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const src = (pack, file) => `cursors/${pack.id}/${file}`;
  const byId = (id) => PACKS.find((p) => p.id === id);

  // ── playing frames ──

  const cursorTimers = {};

  function wearRole(pack, role) {
    const [prop, fallback] = ROLES[role];
    clearTimeout(cursorTimers[role]);
    const r = pack && pack.roles[role];
    if (!r) { root.style.removeProperty(prop); return; }
    // a full URL: a relative one in a custom property resolves against the stylesheet that uses it, not the page
    const value = (frame) => `url("${new URL(src(pack, r.frames[frame]), document.baseURI).href}") ${r.hx} ${r.hy}, ${fallback}`;
    r.frames.forEach((f) => { new Image().src = src(pack, f); }); // every frame loaded before it is needed
    if (r.steps.length < 2 || still) { root.style.setProperty(prop, value(r.steps[0][0])); return; }
    let i = 0;
    const step = () => {
      const [frame, ms] = r.steps[i];
      root.style.setProperty(prop, value(frame));
      i = (i + 1) % r.steps.length;
      cursorTimers[role] = setTimeout(step, ms);
    };
    step();
  }

  // An <img> that plays a pack's preview frames while it is on screen.
  const players = new Map();
  function play(img, pack) {
    stop(img);
    const pv = pack.preview;
    img.src = src(pack, pv.frames[pv.steps[0][0]]);
    img.classList.toggle('pixel', PIXEL_ART.has(pack.id));
    if (pv.steps.length < 2 || still) return;
    let i = 0;
    const tick = () => {
      const [frame, ms] = pv.steps[i];
      img.src = src(pack, pv.frames[frame]);
      i = (i + 1) % pv.steps.length;
      players.set(img, setTimeout(tick, ms));
    };
    tick();
  }
  function stop(img) { clearTimeout(players.get(img)); players.delete(img); }

  // ── the picker ──

  const vibes = document.getElementById('vibes');
  const cards = [];
  for (const vibe of VIBES) {
    const group = document.createElement('div');
    group.className = 'vibe';
    group.innerHTML = `<h3>${vibe}</h3><div class="cards"></div>`;
    const row = group.querySelector('.cards');
    for (const pack of PACKS.filter((p) => p.vibe === vibe)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.dataset.pack = pack.id;
      card.setAttribute('aria-pressed', 'false');
      card.innerHTML = `<span class="face"><img alt="" width="64" height="64"></span>` +
        `<span><span class="name"></span><br><span class="by"></span></span>`;
      card.querySelector('.name').textContent = pack.name;
      card.querySelector('.by').textContent = `${pack.animated ? 'animated · ' : ''}by ${pack.author.split(/[;,]/)[0]}`;
      card.setAttribute('aria-label', `Wear ${pack.name} by ${pack.author}`);
      card.addEventListener('click', () => wear(pack.id));
      row.appendChild(card);
      cards.push([card, pack]);
    }
    if (vibe === 'Clean') {
      const own = document.createElement('button');
      own.type = 'button';
      own.className = 'card own';
      own.dataset.pack = '';
      own.setAttribute('aria-pressed', 'true');
      own.innerHTML = '<span class="face"><span class="mono" style="font-size:12px">your own</span></span><span><span class="name">Your cursor</span><br><span class="by">back to normal</span></span>';
      own.addEventListener('click', () => wear(''));
      row.appendChild(own);
    }
    vibes.appendChild(group);
  }

  // card previews only play while they are on screen
  const watch = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const [card, pack] = cards.find(([c]) => c === e.target);
      const img = card.querySelector('img');
      if (e.isIntersecting) play(img, pack);
      else stop(img);
    }
  });
  for (const [card, pack] of cards) {
    const img = card.querySelector('img');
    img.src = src(pack, pack.preview.frames[0]);
    img.classList.toggle('pixel', PIXEL_ART.has(pack.id));
    watch.observe(card);
  }

  // ── the stage in the hero: a slideshow of packs until you wear one ──

  const stage = document.getElementById('stage');
  const stageImg = stage.querySelector('img');
  const stageName = stage.querySelector('[data-name]');
  const stageHint = stage.querySelector('[data-hint]');
  let shown = null;
  let slideshow = 0;

  function showOnStage(pack, hint) {
    shown = pack;
    play(stageImg, pack);
    stageName.textContent = pack.name;
    stageHint.textContent = hint;
  }
  function startSlideshow() {
    clearInterval(slideshow);
    let i = 0;
    const next = () => { showOnStage(PACKS[i % PACKS.length], 'click to wear it'); i++; };
    next();
    if (!still) slideshow = setInterval(next, 1800);
  }
  stage.addEventListener('click', () => { if (shown) wear(shown.id); });

  // ── wearing ──

  const pillName = document.querySelector('[data-wearing]');
  document.querySelector('[data-takeoff]').addEventListener('click', () => wear(''));

  function wear(id, remember = true) {
    const pack = byId(id);
    for (const role of Object.keys(ROLES)) wearRole(pack, role);
    body.classList.toggle('wearing', Boolean(pack));
    if (pack) root.style.setProperty('--tint', TINTS[pack.id] || '#00B8D9');
    else root.style.removeProperty('--tint');
    for (const el of document.querySelectorAll('[data-pack]')) {
      el.setAttribute('aria-pressed', String(el.dataset.pack === (pack ? pack.id : '')));
    }
    if (pack) {
      clearInterval(slideshow);
      showOnStage(pack, `by ${pack.author.split(/[;,]/)[0]}`);
      pillName.textContent = pack.name;
    } else {
      startSlideshow();
    }
    if (remember) {
      try { pack ? localStorage.setItem(STORE, pack.id) : localStorage.removeItem(STORE); } catch { /* private mode */ }
    }
  }

  // ── the credits table ──

  const credits = document.getElementById('credits');
  for (const pack of PACKS) {
    const tr = document.createElement('tr');
    const cells = [pack.name, pack.vibe, pack.author, pack.license];
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    const a = document.createElement('a');
    a.href = pack.source;
    a.textContent = pack.via;
    td.appendChild(a);
    tr.appendChild(td);
    credits.appendChild(tr);
  }

  let saved = '';
  try { saved = localStorage.getItem(STORE) || ''; } catch { /* private mode */ }
  if (byId(saved)) wear(saved, false);
  else startSlideshow();
})();
