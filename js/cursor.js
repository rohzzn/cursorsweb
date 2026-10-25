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

  // ── the picker: one numbered cell per pack, in vibe order, then your own cursor ──

  const grid = document.getElementById('packs');
  const ordered = VIBES.flatMap((vibe) => PACKS.filter((p) => p.vibe === vibe));
  const cards = [];

  function cell(no, tag, name, by) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cell';
    el.setAttribute('aria-pressed', 'false');
    el.innerHTML = '<span class="top"><span class="no"></span><span class="tag"></span></span>' +
      '<span class="face"></span><span><span class="name"></span><span class="by"></span></span>';
    el.querySelector('.no').textContent = no;
    el.querySelector('.tag').textContent = tag;
    el.querySelector('.name').textContent = name;
    el.querySelector('.by').textContent = by;
    grid.appendChild(el);
    return el;
  }

  ordered.forEach((pack, i) => {
    const el = cell(String(i + 1).padStart(2, '0'), pack.vibe, pack.name, `by ${pack.author.split(/[;,]/)[0].trim()}`);
    el.dataset.pack = pack.id;
    el.setAttribute('aria-label', `Wear ${pack.name} by ${pack.author}`);
    const img = document.createElement('img');
    img.alt = '';
    img.width = img.height = 96;
    img.className = pack.preview.pixelated ? 'pixelated' : '';
    img.src = src(pack, pack.preview.frames[0]);
    el.querySelector('.face').appendChild(img);
    el.addEventListener('click', () => wear(pack.id));
    cards.push([el, pack]);
  });

  const own = cell('00', 'Default', 'Your cursor', 'back to normal');
  own.dataset.pack = '';
  own.setAttribute('aria-pressed', 'true');
  own.querySelector('.face').innerHTML = '<svg width="52" height="52" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 2 L4 25 L9.5 19.8 L13.5 28.5 L17.6 26.7 L13.7 18.2 L21 18.2 Z" fill="#FFFFFF" stroke="#0E0E0E" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  own.addEventListener('click', () => wear(''));

  // card previews only play while they are on screen
  const watch = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const [card, pack] = cards.find(([c]) => c === e.target);
      const img = card.querySelector('img');
      if (e.isIntersecting) play(img, pack);
      else stop(img);
    }
  });
  for (const [card] of cards) watch.observe(card);

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
    if (pack) pillName.textContent = pack.name;
    if (remember) {
      try { pack ? localStorage.setItem(STORE, pack.id) : localStorage.removeItem(STORE); } catch { /* private mode */ }
    }
  }

  // ── the credits table ──

  const credits = document.getElementById('credits');
  ordered.forEach((pack, i) => {
    const tr = document.createElement('tr');
    const cells = [String(i + 1).padStart(2, '0'), pack.name, pack.vibe, pack.author, pack.license];
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
  });

  let saved = '';
  try { saved = localStorage.getItem(STORE) || ''; } catch { /* private mode */ }
  if (byId(saved)) wear(saved, false);
})();
