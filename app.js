/* ============================================================
   Allya v2 — workspace behavior + motion
   Springs follow Apple's "Designing Fluid Interfaces":
   - animate from the presentation (live) value, always interruptible
   - carry velocity through re-targets (no reversal "brick wall")
   - hand off gesture velocity; project momentum for flicks
   ============================================================ */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDesktop = window.matchMedia('(min-width: 900px)');

/* ---- Spring: Apple's two knobs (response + damping ratio), numerically
   integrated so it can be re-targeted mid-flight from the current value
   and velocity — the property that makes interruption clean. */
class Spring {
  constructor(value, { response = 0.4, damping = 1.0, onframe } = {}) {
    this.x = value; this.v = 0; this.target = value;
    this.response = response; this.damping = damping;
    this.onframe = onframe;
    this.running = false; this._raf = 0; this._last = 0;
  }
  set(response, damping) {
    if (response != null) this.response = response;
    if (damping != null) this.damping = damping;
    return this;
  }
  to(target, velocity) {
    this.target = target;
    if (velocity != null) this.v = velocity;
    if (reduceMotion) {
      this.x = target; this.v = 0;
      this.onframe && this.onframe(this.x, this.v, true);
      return this;
    }
    this._start();
    return this;
  }
  track(value) {
    this.stop(); this.x = value; this.target = value;
    this.onframe && this.onframe(this.x, 0, false);
    return this;
  }
  _start() {
    if (this.running) return;
    this.running = true; this._last = performance.now();
    const step = (now) => {
      if (!this.running) return;
      let dt = (now - this._last) / 1000; this._last = now;
      if (dt > 1 / 30) dt = 1 / 30;
      const w = (2 * Math.PI) / this.response;
      const k = w * w;
      const c = 2 * this.damping * w;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const a = -k * (this.x - this.target) - c * this.v;
        this.v += a * h;
        this.x += this.v * h;
      }
      const settled = Math.abs(this.x - this.target) < 0.15 && Math.abs(this.v) < 0.15;
      if (settled) { this.x = this.target; this.v = 0; this.running = false; }
      this.onframe && this.onframe(this.x, this.v, settled);
      if (this.running) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
  stop() { this.running = false; cancelAnimationFrame(this._raf); return this; }
}

/* Apple's momentum projection — where a flick would come to rest. */
function project(velocity, deceleration = 0.998) {
  return (velocity / 1000) * deceleration / (1 - deceleration);
}
/* Rubber-band resistance past a boundary. */
function rubberband(overshoot, dim, c = 0.55) {
  return (overshoot * dim * c) / (dim + c * Math.abs(overshoot));
}

/* Instant press feedback — scale on pointer-down, spring back on release. */
function pressable(el, scale = 0.96) {
  const s = new Spring(1, { response: 0.28, damping: 0.75,
    onframe: (v) => { el.style.transform = `scale(${v})`; } });
  const down = () => s.to(scale);
  const up = () => s.to(1);
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
}

function haptic(pattern) {
  if (navigator.vibrate && !reduceMotion) navigator.vibrate(pattern);
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

/* ============================================================
   Work panel — data-driven; the visible proof this is a tool
   ============================================================ */
const WORK = [
  { id: 'newsletter', status: 'needs-you', origin: 'expert',
    who: 'A', whoName: 'Allya', whoRole: 'with your PR expert',
    say: 'Next week’s newsletter is drafted around the SurferSearcher result. Your PR expert’s edits are in. Read it before it ships?' },
  { id: 'leads', status: 'running', origin: 'agent',
    title: 'Enriching 40 leads from last week’s signups', meta: 'agent · ~8 min left' },
  { id: 'screening', status: 'running', origin: 'agent',
    title: 'Screening 6 candidates for the ops role', meta: 'agent · ranking against your approved JD' },
  { id: 'press', status: 'running', origin: 'expert',
    title: 'Press list — 22 journalists, matched to your space', meta: 'expert · final pass' },
  { id: 'crm', status: 'shipped', origin: 'agent',
    title: 'CRM cleanup — 41 stale leads merged, 12 archived', meta: '6:40am · sales expert spot-checked' },
  { id: 'jd', status: 'shipped', origin: 'agent',
    title: 'Ops-hire JD written and posted to three boards', meta: '7:15am · 6 already through first screen' },
];

const workPanel = document.getElementById('workPanel');
const TICK_SVG = '<svg viewBox="0 0 12 12" fill="none"><path d="M2 6.2l2.6 2.6L10 3" stroke="#91d45f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderWork() {
  const needs = WORK.filter(w => w.status === 'needs-you');
  const running = WORK.filter(w => w.status === 'running');
  const shipped = WORK.filter(w => w.status === 'shipped');

  let html = '';

  html += `<div class="group-label">Needs you <span class="count">${needs.length}</span></div>`;
  if (needs.length === 0) {
    html += `<div class="work-row"><div class="w-copy"><div class="s">Nothing waiting on you. Enjoy it.</div></div></div>`;
  }
  needs.forEach(w => {
    html += `
    <div class="approval-card" data-open-sheet="${w.id}" tabindex="0" role="button">
      <div class="who">
        <span class="avatar">${w.who}</span>
        <span class="name">${w.whoName} <span class="role">· ${w.whoRole}</span></span>
      </div>
      <p class="say">${w.say}</p>
      <div class="act">
        <button class="cta" data-open-sheet="${w.id}">Review →</button>
        <span class="hint">nothing ships until you approve</span>
      </div>
    </div>`;
  });

  html += `<div class="group-label">Running <span class="count">${running.length}</span></div>`;
  running.forEach(w => {
    html += `
    <div class="work-row">
      <span class="spinner"></span>
      <div class="w-copy"><div class="t">${w.title}</div><div class="s">${w.meta}</div></div>
      <span class="pill ${w.origin === 'expert' ? 'expert' : ''}">${w.origin === 'expert' ? 'expert' : 'agent'}</span>
    </div>`;
  });

  html += `<div class="group-label">Shipped today <span class="count">${shipped.length}</span></div>`;
  shipped.forEach(w => {
    html += `
    <div class="work-row shipped" data-work-id="${w.id}">
      <span class="tick">${TICK_SVG}</span>
      <div class="w-copy"><div class="t">${w.title}</div>
        <div class="s">${w.meta}${w.undoable ? ' · <button class="row-undo" data-undo="' + w.id + '">undo</button>' : ''}</div></div>
      <span class="pill">${w.origin === 'expert' ? 'expert' : 'agent'}</span>
    </div>`;
  });

  workPanel.innerHTML = html;
  workPanel.querySelectorAll('.approval-card, .approval-card .cta').forEach(el => {
    pressable(el, el.classList.contains('cta') ? 0.95 : 0.99);
  });
  syncStatus();
}

function syncStatus() {
  const running = WORK.filter(w => w.status === 'running').length;
  const needs = WORK.filter(w => w.status === 'needs-you').length;
  const shippedN = WORK.filter(w => w.status === 'shipped').length;
  document.getElementById('statusText').textContent =
    `${running} agent${running === 1 ? '' : 's'} running` + (needs ? ` · ${needs} needs you` : '');
  const badge = document.getElementById('tabBadge');
  badge.textContent = needs ? `·${needs}` : '';
  renderCanvas();
  if (window.__island) window.__island.refresh();
}

/* ============================================================
   The quiet canvas — one decision + your day, side by side,
   above the brain. Everything derives from WORK plus scripted context.
   ============================================================ */
const DAY_PLAN = [
  { time: '11:00', what: 'Investor call — Meridian', pill: 'notes ready' },
  { time: '15:00', what: 'Ops interview — Ananya R.', pill: 'brief ready' },
  { time: '—', what: 'Nothing else. I kept your afternoon clear on purpose.', quiet: true },
];
let decisionDeferred = false;

function renderCanvas() {
  const top = document.getElementById('canvasTop');
  if (!top) return;
  const needs = WORK.filter(w => w.status === 'needs-you');

  const greet = needs.length
    ? `Morning. While you slept, things moved — one is waiting on your eyes.`
    : `Morning. Everything that moved overnight is handled.`;

  let decision = '';
  if (needs.length && !decisionDeferred) {
    const w = needs[0];
    decision = `
    <div class="c-sec accent">
      <div class="group-label">Needs you</div>
      <div class="approval-card" data-open-sheet="${w.id}" tabindex="0" role="button">
        <div class="who"><span class="avatar">${w.who}</span>
          <span class="name">${w.whoName} <span class="role">· ${w.whoRole}</span></span></div>
        <p class="say">${w.say}</p>
        <div class="c-card-act">
          <button class="cta" data-open-sheet="${w.id}">Review now</button>
          <button class="c-later">Later today</button>
        </div>
      </div>
    </div>`;
  } else if (needs.length && decisionDeferred) {
    decision = `<div class="c-sec accent"><div class="group-label">Needs you</div><p class="c-waiting">1 thing waiting for tonight · <button class="c-now">actually, show me now</button></p></div>`;
  } else {
    decision = `<div class="c-sec"><div class="group-label">Needs you</div><p class="c-handled">Nothing right now. Agents are working; experts are checking. That's the whole point.</p></div>`;
  }

  const dayRows = DAY_PLAN.map(d => `
    <div class="day-row">
      <span class="dr-time">${d.time}</span>
      <span class="dr-what ${d.quiet ? 'quiet' : ''}">${d.what}</span>
      ${d.pill ? `<span class="pill ready">${d.pill}</span>` : ''}
    </div>`).join('');

  top.innerHTML = `
    <p class="canvas-greet">${greet}</p>
    <div class="c-row">
      ${decision}
      <div class="c-sec"><div class="group-label">Today</div>${dayRows}</div>
    </div>`;

  top.querySelectorAll('.approval-card, .approval-card .cta').forEach(el =>
    pressable(el, el.classList.contains('cta') ? 0.95 : 0.99));
}

/* canvas interactions: defer the decision, bring it back */
document.addEventListener('click', (e) => {
  if (e.target.closest('.c-later')) {
    e.stopPropagation();
    decisionDeferred = true;
    renderCanvas();
    return;
  }
  if (e.target.closest('.c-now')) {
    decisionDeferred = false;
    renderCanvas();
    return;
  }
});

/* move an item to shipped with a small spring entrance on its new row */
function shipItem(id, newTitle, newMeta, undoable) {
  const w = WORK.find(x => x.id === id);
  if (!w) return;
  w.status = 'shipped';
  w.undoable = !!undoable;
  if (newTitle) w.title = newTitle;
  if (newMeta) w.meta = newMeta;
  // shipped list shows newest first
  WORK.splice(WORK.indexOf(w), 1);
  const firstShippedIdx = WORK.findIndex(x => x.status === 'shipped');
  WORK.splice(firstShippedIdx === -1 ? WORK.length : firstShippedIdx, 0, w);
  renderWork();
  const row = workPanel.querySelector(`[data-work-id="${id}"]`);
  if (row && !reduceMotion) {
    row.style.opacity = 0; row.style.transform = 'translateY(-8px)';
    new Spring(0, { response: 0.45, damping: 0.85, onframe: (p, v, settled) => {
      row.style.opacity = p; row.style.transform = `translateY(${-8 * (1 - p)}px)`;
      if (settled) { row.style.transform = ''; row.style.opacity = ''; }
    }}).to(1);
  }
}

/* ============================================================
   Conversation
   ============================================================ */
const thread = document.getElementById('thread');
const threadScroll = document.getElementById('threadScroll');
let lastSpeaker = null;

function scrollThread() {
  requestAnimationFrame(() => {
    threadScroll.scrollTo({ top: threadScroll.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
}

function addMsg(speaker, html, opts = {}) {
  const row = document.createElement('div');
  row.className = 'msg ' + (speaker === 'you' ? 'from-you' : '');
  if (lastSpeaker && lastSpeaker !== speaker) row.classList.add('change');
  lastSpeaker = speaker;

  const block = document.createElement('div');
  block.className = 'msg-block';
  if (opts.tag) {
    const t = document.createElement('div'); t.className = 'speaker';
    t.innerHTML = opts.tag; block.appendChild(t);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + speaker;
  bubble.innerHTML = html;
  block.appendChild(bubble);
  row.appendChild(block);
  thread.appendChild(row);

  if (!reduceMotion) {
    const dyStart = 10;
    bubble.style.opacity = 0; bubble.style.transform = `translateY(${dyStart}px)`;
    new Spring(0, { response: 0.4, damping: 0.85, onframe: (p, v, settled) => {
      bubble.style.opacity = p; bubble.style.transform = `translateY(${dyStart * (1 - p)}px)`;
      if (settled) { bubble.style.transform = ''; bubble.style.opacity = ''; }
    }}).to(1);
  }
  scrollThread();
  return row;
}

function typing(then, delay = 900) {
  const row = document.createElement('div');
  row.className = 'msg change';
  row.innerHTML = `<div class="msg-block"><div class="bubble allya typing" aria-label="Allya is typing"><i></i><i></i><i></i></div></div>`;
  thread.appendChild(row); scrollThread();
  setTimeout(() => { row.remove(); then(); }, reduceMotion ? 200 : delay);
}

const SCRIPT = {
  newsletter: () => {
    typing(() => {
      addMsg('allya', `Good one to get ahead of. I'll draft next week's around the SurferSearcher result — 13 campaigns in month one reads better than anything I could invent.`);
      typing(() => {
        addMsg('allya', `I broke it into three: subject lines, the body, and a P.S. that asks for one reply. Your PR expert already tightened two lines. It's waiting in your work panel.`);
        showChips([
          { label: 'Show me the draft', act: () => openSheet('newsletter') },
          { label: 'Change the angle', act: () => quickSay('Change the angle') },
        ]);
      }, 1100);
    });
  },
  hiring: () => {
    typing(() => {
      addMsg('allya', `You have 6 people through the first screen for the ops role. I ranked them against the JD you approved, not against a résumé template.`);
      typing(() => {
        addMsg('human', `I sat in on the top two — both worth 20 minutes of your time. I've held Thursday 3pm and 4pm.`, { tag: `<span class="human-tag">Your hiring expert</span>` });
        showChips([
          { label: 'Book both', act: () => quickSay('Book both') },
          { label: 'See the ranking', act: () => openSheet('hiring') },
        ]);
      }, 1400);
    });
  },
  fallback: () => {
    typing(() => {
      addMsg('allya', `Noted. I'll take the first pass and it'll show up in your work panel before anything ships — you approve, then it goes out.`);
    });
  },
};

function showChips(list) {
  const wrap = document.createElement('div'); wrap.className = 'chips';
  list.forEach(c => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = c.label;
    pressable(b, 0.94);
    b.addEventListener('click', () => { wrap.remove(); c.act(); });
    wrap.appendChild(b);
  });
  thread.appendChild(wrap); scrollThread();
}

function quickSay(text) {
  addMsg('you', escapeHtml(text));
  const key = text.toLowerCase();
  if (key.includes('angle')) SCRIPT.fallback();
  else if (key.includes('book')) typing(() => addMsg('allya', `Done — both are on your calendar for Thursday. I sent each a short note with the role and what to expect. No prep needed from you.`));
  else SCRIPT.fallback();
}

function sendText(text) {
  const t = text.trim(); if (!t) return;
  addMsg('you', escapeHtml(t));
  const k = t.toLowerCase();
  if (k.includes('news') || k.includes('letter') || k.includes('campaign')) SCRIPT.newsletter();
  else if (k.includes('hir') || k.includes('candidate') || k.includes('screen') || k.includes('interview')) SCRIPT.hiring();
  else SCRIPT.fallback();
}

const input = document.getElementById('composerInput');
const sendBtn = document.getElementById('sendBtn');
pressable(sendBtn, 0.9);
function submitComposer() { if (!input.value.trim()) return; sendText(input.value); input.value = ''; hideSuggest(); }
sendBtn.addEventListener('click', submitComposer);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitComposer();
  if (e.key === 'Escape') {
    // first Escape closes the popup; a second (with an empty field) steps
    // back to the quiet canvas
    if (!suggest.hidden && suggestPop.target === 1) hideSuggest();
    else if (!input.value.trim()) disengageChat();
  }
});

/* ---- the canvas ↔ chat handover: messages stay out of sight
   until you actually engage the bar ---- */
const paneChat = document.getElementById('paneChat');
const canvas = document.getElementById('canvas');
let chatEngaged = false;

/* State flips immediately; springs are presentation only, so an
   interrupted (or throttled) animation can never strand the UI. */
function riseIn(el) {
  if (reduceMotion) return;
  el.style.opacity = 0;
  new Spring(0, { response: 0.4, damping: 0.9, onframe: (q, w, done) => {
    el.style.opacity = q;
    el.style.transform = `translateY(${14 * (1 - q)}px)`;
    if (done) { el.style.opacity = ''; el.style.transform = ''; }
  }}).to(1);
}

function engageChat() {
  if (chatEngaged) return;
  chatEngaged = true;
  paneChat.classList.add('engaged');
  riseIn(threadScroll);
  scrollThread();
}

function disengageChat() {
  if (!chatEngaged) return;
  chatEngaged = false;
  input.blur();
  paneChat.classList.remove('engaged');
  riseIn(canvas);
}

/* ---- the composer pops when you engage it ---- */
const composerEl = document.querySelector('.composer');
const fieldEl = composerEl.querySelector('.field');
const suggest = document.getElementById('suggest');

const fieldPop = new Spring(0, { response: 0.32, damping: 0.72, onframe: (p, v, settled) => {
  fieldEl.style.transform = `translateY(${-2.5 * p}px) scale(${1 + 0.012 * p})`;
  if (settled && p === 0) fieldEl.style.transform = '';
}});
const suggestPop = new Spring(0, { response: 0.34, damping: 0.78, onframe: (p, v, settled) => {
  suggest.style.opacity = clamp(p, 0, 1);
  suggest.style.transform = `translateY(${9 * (1 - p)}px) scale(${0.96 + 0.04 * Math.min(p, 1.2)})`;
  if (settled && p <= 0.01) suggest.hidden = true;
}});

function showSuggest() {
  if (!suggest.hidden && suggestPop.target === 1) return;
  if (suggest.hidden) {
    // pre-paint the start pose so unhiding never flashes at full opacity
    suggest.style.opacity = 0;
    suggest.style.transform = 'translateY(9px) scale(0.96)';
    suggest.hidden = false;
  }
  fieldPop.to(1, 6);         // pop with a little arrival momentum
  suggestPop.to(1, 5);
}
function hideSuggest() {
  fieldPop.set(0.3, 1).to(0);
  suggestPop.set(0.3, 1).to(0);
}

input.addEventListener('focus', () => { engageChat(); showSuggest(); });
composerEl.addEventListener('focusout', (e) => {
  if (composerEl.contains(e.relatedTarget)) return;   // moving within the composer
  hideSuggest();
});
suggest.querySelectorAll('.suggest-item').forEach(b => {
  b.addEventListener('mousedown', (e) => e.preventDefault());   // keep the input focused
  b.addEventListener('click', () => { hideSuggest(); sendText(b.dataset.say); });
});

/* opening beats — a tool opens already working */
function seedChat() {
  addMsg('allya', `Morning. While you slept, three things moved — two shipped, one's waiting on your eyes in the work panel. I never send anything without you.`);
  showChips([
    { label: 'Review the newsletter', act: () => openSheet('newsletter') },
    { label: 'Where’s the ops hire?', act: () => sendText('Where’s the ops hire?') },
  ]);
}

/* ============================================================
   Approval surface — axis-aware (x on desktop, y on mobile)
   ============================================================ */
const scrim = document.getElementById('scrim');
const sheet = document.getElementById('sheet');
const grab = document.getElementById('grabZone');
let sheetOpen = false, sheetContext = null;
let closedPos = 0, sheetDim = 0;
const axis = () => (isDesktop.matches ? 'x' : 'y');

const sheetSpring = new Spring(0, { response: 0.34, damping: 0.82, onframe: (p, v, settled) => {
  sheet.style.transform = axis() === 'x' ? `translateX(${p}px)` : `translateY(${p}px)`;
  const t = 1 - clamp(p / (closedPos || 1), 0, 1);
  scrim.style.opacity = 0.5 * t;
  if (settled && p >= closedPos - 0.5 && sheetOpen === 'closing') finishClose();
}});

function measure() {
  sheetDim = axis() === 'x' ? sheet.offsetWidth : sheet.offsetHeight;
  closedPos = sheetDim + 40;
}

function openSheet(context) {
  sheetContext = context;
  fillSheet(context);
  scrim.classList.add('live');
  sheet.style.transform = axis() === 'x' ? 'translateX(105%)' : 'translateY(105%)';
  sheetOpen = true;
  requestAnimationFrame(() => {
    measure();
    sheetSpring.set(0.34, 0.82);
    sheetSpring.stop(); sheetSpring.x = closedPos;
    sheetSpring.to(0, -1400);
  });
}
function closeSheet(velocity = 0) {
  if (!sheetOpen) return;
  sheetOpen = 'closing';
  measure();
  sheetSpring.set(0.3, 1.0).to(closedPos, velocity);
}
function finishClose() {
  scrim.classList.remove('live');
  scrim.style.opacity = 0;
  sheetOpen = false;
}

scrim.addEventListener('click', () => closeSheet(600));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen) closeSheet(600);
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && document.activeElement !== input)) {
    e.preventDefault(); input.focus();
  }
});
document.getElementById('kbdHint').addEventListener('click', () => input.focus());

/* drag: pointer events, 1:1 tracking, velocity history, rubber-band */
let dragging = false, startPointer = 0, startSheet = 0;
let vHist = [];

const pointerCoord = (e) => (axis() === 'x' ? e.clientX : e.clientY);

function currentSheetPos() {
  const m = new DOMMatrixReadOnly(getComputedStyle(sheet).transform);
  return axis() === 'x' ? (m.m41 || 0) : (m.m42 || 0);
}
function onDown(e) {
  if (!sheetOpen) return;
  measure();
  dragging = true;
  sheetSpring.stop();
  startPointer = pointerCoord(e);
  startSheet = currentSheetPos();
  vHist = [{ t: performance.now(), p: startPointer }];
  grab.setPointerCapture(e.pointerId);
}
function onMove(e) {
  if (!dragging) return;
  let pos = startSheet + (pointerCoord(e) - startPointer);
  if (pos < 0) pos = -rubberband(-pos, sheetDim);
  sheet.style.transform = axis() === 'x' ? `translateX(${pos}px)` : `translateY(${pos}px)`;
  scrim.style.opacity = 0.5 * (1 - clamp(pos / closedPos, 0, 1));
  vHist.push({ t: performance.now(), p: pointerCoord(e) });
  if (vHist.length > 6) vHist.shift();
}
function onUp() {
  if (!dragging) return;
  dragging = false;
  const pos = currentSheetPos();
  const vel = velocityFromHistory();
  sheetSpring.x = pos; sheetSpring.v = vel;
  const projected = pos + project(vel);
  if (projected > closedPos * 0.32 || vel > 550) {
    closeSheet(vel);
  } else {
    sheetSpring.set(0.34, 0.8).to(0, vel);
  }
}
function velocityFromHistory() {
  if (vHist.length < 2) return 0;
  const a = vHist[0], b = vHist[vHist.length - 1];
  const dt = (b.t - a.t) / 1000;
  return dt > 0 ? (b.p - a.p) / dt : 0;
}
grab.addEventListener('pointerdown', onDown);
grab.addEventListener('pointermove', onMove);
grab.addEventListener('pointerup', onUp);
grab.addEventListener('pointercancel', onUp);

/* if the breakpoint flips while open, snap to the new geometry */
isDesktop.addEventListener('change', () => {
  if (sheetOpen === true) {
    sheet.style.transform = axis() === 'x' ? 'translateX(0px)' : 'translateY(0px)';
    sheetSpring.stop(); sheetSpring.x = 0;
  }
});

/* content per context */
function fillSheet(context) {
  const head = document.getElementById('sheetHead');
  const body = document.getElementById('sheetBody');
  if (context === 'newsletter') {
    head.innerHTML = `
      <div class="avatar">A</div>
      <div>
        <div class="who">Allya <span class="role">· with your PR expert</span></div>
        <div class="line">Next week’s newsletter. Read it, then approve — nothing sends until you do.</div>
      </div>`;
    body.innerHTML = `
      ${trail([
        { kind: 'agent', txt: 'Drafted by agent', time: '6:12am' },
        { kind: 'expert', txt: 'Your PR expert edited 2 lines', time: '6:58am', toggle: true },
        { kind: 'you', txt: 'Waiting on you — nothing ships without this step' },
      ], `
        <div class="d-pair"><div class="d-old">We ran 13 marketing campaigns for SurferSearcher last month</div>
        <div class="d-new">The agency did 13 campaigns. In one month.</div></div>
        <div class="d-pair"><div class="d-old">Our AI-powered platform can streamline your marketing</div>
        <div class="d-new">You didn’t start a company to write newsletters at 11pm.</div></div>`)}
      ${draft('Subject line', 'The agency did 13 campaigns. In one month.',
        'Leads with the SurferSearcher number. No adjectives — the figure carries it.', ['open rate angle', 'A/B ready'])}
      ${draft('Body', 'You didn’t start a company to write newsletters at 11pm.',
        'Three short paragraphs. One idea each. Ends on your actual offer, not a pitch.', ['your voice', 'expert edited'])}
      ${draft('P.S.', 'Reply with one word — the thing eating your week. I’ll take it from there.',
        'Asks for a single reply so you can start real conversations, not track opens.', ['1 reply goal'])}
      <p class="undo-note">After you approve, it holds for 10 minutes before actually sending — you can pull it back.</p>`;
    document.getElementById('approveLabel').textContent = 'Approve — schedule it';
  } else {
    head.innerHTML = `
      <div class="avatar human">${PERSON_SVG}</div>
      <div>
        <div class="who">Your hiring expert</div>
        <div class="line">Six through the first screen. Here are the two I’d spend your time on.</div>
      </div>`;
    body.innerHTML = `
      ${trail([
        { kind: 'agent', txt: 'Agent screened 6 candidates overnight', time: '5:30am' },
        { kind: 'expert', txt: 'Your hiring expert sat in on the top two', time: '8:15am' },
        { kind: 'you', txt: 'Waiting on you — your call, always' },
      ])}
      ${draft('#1 — Ananya R.', 'Ran ops solo at a seed-stage fintech for 2 years.',
        'Did the messy version of this job with no team. Strong on the parts you hate.', ['ops', 'seed-stage', 'available in 2 wks'])}
      ${draft('#2 — Karan M.', 'Built the hiring pipeline at a 4-person startup.',
        'Less ops depth, more range. Would grow into it fast. Worth the second slot.', ['generalist', 'fast start'])}
      <p class="sheet-note">The other four weren’t a fit for the JD you approved. I can share the notes if you want them.</p>`;
    document.getElementById('approveLabel').textContent = 'Book both interviews';
  }
}
function draft(kicker, title, body, tags) {
  return `<div class="draft">
    <div class="kicker">${kicker}</div>
    <h4>${title}</h4>
    <p>${body}</p>
    <div class="tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
  </div>`;
}

const PERSON_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none"><path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 8.5a6.5 6.5 0 0 1 13 0" stroke="#e7c98a" stroke-width="2" stroke-linecap="round"/></svg>';

/* provenance trail — who touched this, in order */
function trail(rows, diffHtml) {
  return `<div class="trail">
    ${rows.map(r => `
      <div class="trail-row ${r.kind === 'you' ? 'now' : ''}">
        <span class="t-dot ${r.kind}">${r.kind === 'expert' ? PERSON_SVG : ''}</span>
        <span class="t-txt">${r.txt}</span>
        ${r.toggle ? '<button class="trail-toggle">see the edits</button>' : ''}
        ${r.time ? `<span class="t-time">${r.time}</span>` : ''}
      </div>`).join('')}
    ${diffHtml ? `<div class="trail-diff" hidden>${diffHtml}</div>` : ''}
  </div>`;
}

/* expand/collapse the expert's actual edits */
document.addEventListener('click', (e) => {
  const t = e.target.closest('.trail-toggle');
  if (!t) return;
  const diff = t.closest('.trail').querySelector('.trail-diff');
  if (!diff) return;
  diff.hidden = !diff.hidden;
  t.textContent = diff.hidden ? 'see the edits' : 'hide the edits';
});

/* approve → commit cue + item moves to Shipped + chat beat */
const shipped = document.getElementById('shipped');
document.getElementById('approveBtn').addEventListener('click', () => {
  haptic([12, 40, 18]);
  const ctx = sheetContext;
  closeSheet(700);
  setTimeout(() => {
    if (ctx === 'newsletter') {
      shipItem('newsletter', 'Newsletter approved — goes out Tuesday 9am', 'holds 10 min before sending', true);
      toast('Scheduled. You have 10 minutes to pull it back.');
      addMsg('you', 'Approved');
      typing(() => addMsg('allya', `Scheduled for Tuesday 9am. It holds for 10 minutes in case you change your mind — after that I’ll watch the replies and pull anything worth your time into here.`), 700);
    } else {
      toast('Booked. Thursday 3 & 4pm are on your calendar.');
      addMsg('you', 'Book both');
      typing(() => addMsg('allya', `Done. Both are booked, and I sent each a short note so Thursday isn’t cold.`), 700);
    }
  }, 240);
});
document.getElementById('editBtn').addEventListener('click', () => {
  const ctx = sheetContext;
  closeSheet(500);
  setTimeout(() => {
    addMsg('you', 'Ask for a change');
    typing(() => addMsg('allya', ctx === 'newsletter'
      ? `Tell me what’s off — the angle, the subject line, or the ask — and I’ll have a new pass in the panel within the hour.`
      : `Tell me what you’d change about the shortlist and I’ll re-rank.`), 700);
  }, 240);
});

function toast(text) {
  shipped.querySelector('.txt').textContent = text;
  const s = new Spring(24, { response: 0.42, damping: 0.8, onframe: (y) => {
    shipped.style.transform = `translate(-50%, ${y}px)`;
    shipped.style.opacity = clamp(1 - y / 24, 0, 1);
  }});
  s.to(0, -260);
  setTimeout(() => {
    new Spring(0, { response: 0.4, damping: 1, onframe: (p) => {
      shipped.style.opacity = 1 - p; shipped.style.transform = `translate(-50%, ${p * 12}px)`;
    }}).to(1);
  }, 2600);
}

/* ============================================================
   Mobile tabs
   ============================================================ */
const workspace = document.getElementById('workspace');
document.querySelectorAll('.tab').forEach(t => {
  pressable(t, 0.95);
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    workspace.classList.toggle('show-work', t.dataset.tab === 'work');
  });
});

/* open-sheet delegation (work panel re-renders, so delegate) */
document.addEventListener('click', (e) => {
  const undo = e.target.closest('[data-undo]');
  if (undo) {
    e.stopPropagation();
    unshipItem(undo.dataset.undo);
    return;
  }
  const el = e.target.closest('[data-open-sheet]');
  if (el) { e.stopPropagation(); openSheet(el.dataset.openSheet); }
});

/* pull an approved item back inside its undo window */
function unshipItem(id) {
  const w = WORK.find(x => x.id === id);
  if (!w) return;
  w.status = 'needs-you';
  w.undoable = false;
  if (id === 'newsletter') {
    w.title = undefined;
    w.say = 'Held it — the newsletter is back in your queue, unsent. Take another look whenever.';
  }
  WORK.splice(WORK.indexOf(w), 1);
  WORK.unshift(w);
  renderWork();
  haptic([10]);
  toast('Held. Nothing sent.');
  addMsg('you', 'Undo that');
  typing(() => addMsg('allya', `Pulled it back — nothing went out. It's in your queue again; no harm done.`), 600);
}

/* ============================================================
   Dynamic island — a split pill pinned to the top of the Talk pane.
   Left: KPIs, stepping one at a time. Right: the to-do list in
   continuous running motion. "Divided in 2, like the old design."
   ============================================================ */
(function island() {
  const kpiCell = document.getElementById('islKpi');
  const todoCell = document.getElementById('islTodo');
  if (!kpiCell || !todoCell) return;
  const ROW = 40;                 // island height / row height
  let kpiTrack, todoTrack, kpiItems = [], kpiIdx = 0, kpiTimer = 0;
  let todoOffset = 0, todoLoopH = 0;
  let raf = 0, last = 0;
  const kpiStep = new Spring(0, { response: 0.5, damping: 0.85, onframe: (y) => {
    if (kpiTrack) kpiTrack.style.transform = `translateY(${-y}px)`;
  }});

  function kpis() {
    const running = WORK.filter(w => w.status === 'running').length;
    const needs = WORK.filter(w => w.status === 'needs-you').length;
    const shipped = WORK.filter(w => w.status === 'shipped').length + 12;   // +12 earlier this week
    return [
      { n: shipped, l: 'shipped this week' },
      { n: running, l: running === 1 ? 'agent running' : 'agents running' },
      { n: needs, l: needs === 1 ? 'thing needs you' : 'things need you' },
      { n: '₹0', l: 'spent · first month free' },
    ];
  }
  function todos() {
    const needs = WORK.filter(w => w.status === 'needs-you').map(w => ({ needs: true, t: shortTitle(w) }));
    const running = WORK.filter(w => w.status === 'running').map(w => ({ needs: false, t: shortTitle(w) }));
    const list = [...needs, ...running];
    return list.length ? list : [{ needs: false, t: 'All clear — nothing waiting' }];
  }
  function shortTitle(w) {
    if (w.id === 'newsletter') return 'Approve next week’s newsletter';
    if (w.status === 'needs-you') return 'Review — ' + (w.title || 'waiting on you');
    return (w.title || '').replace(/ from last week’s signups| against your approved JD| matched to your space/, '');
  }

  function build() {
    // KPI: a vertical track; wraps by appending a clone of the first item
    kpiItems = kpis();
    kpiIdx = 0; kpiTimer = 0;
    kpiCell.innerHTML = `<span class="isl-dot"></span><div class="kpi-track"></div>`;
    kpiTrack = kpiCell.querySelector('.kpi-track');
    const all = [...kpiItems, kpiItems[0]];
    kpiTrack.innerHTML = all.map((k, i) =>
      `<div class="kpi-item" style="transform:translateY(${i * ROW}px)"><span><b>${k.n}</b> ${k.l}</span></div>`).join('');
    kpiStep.stop(); kpiStep.x = 0; kpiTrack.style.transform = 'translateY(0px)';

    // to-do: duplicate the list so the upward scroll is seamless
    const list = todos();
    todoLoopH = list.length * ROW;
    todoCell.innerHTML =
      `<span class="todo-tag">to-do</span><div class="todo-track"><div class="todo-list"></div></div>`;
    todoTrack = todoCell.querySelector('.todo-list');
    todoTrack.innerHTML = [...list, ...list].map(t =>
      `<div class="todo-item"><span class="td-dot ${t.needs ? 'needs' : ''}"></span>${escapeHtml(t.t)}</div>`).join('');
    todoOffset = 0; todoTrack.style.transform = 'translateY(0px)';

    if (reduceMotion) { todoTrack.style.transform = 'translateY(0px)'; }
  }

  function refresh() { const wasRunning = !!raf; build(); if (wasRunning) { /* keep looping */ } }

  function tick(now) {
    if (!raf) return;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    const hidden = document.hidden || !todoCell.offsetParent;
    if (!hidden && !reduceMotion) {
      // KPI steps every ~3.2s
      kpiTimer += dt;
      if (kpiTimer > 3.2) {
        kpiTimer = 0;
        kpiIdx++;
        kpiStep.to(kpiIdx * ROW);
        if (kpiIdx >= kpiItems.length) {   // landed on the appended clone → snap home
          setTimeout(() => { kpiIdx = 0; kpiStep.stop(); kpiStep.x = 0; if (kpiTrack) kpiTrack.style.transform = 'translateY(0px)'; }, 520);
        }
      }
      // to-do scrolls up continuously
      todoOffset += dt * 22;
      if (todoOffset >= todoLoopH) todoOffset -= todoLoopH;
      if (todoTrack) todoTrack.style.transform = `translateY(${-todoOffset}px)`;
    }
    raf = requestAnimationFrame(tick);
  }

  function start() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(tick); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  todoCell.addEventListener('click', () => {
    const top = WORK.find(w => w.status === 'needs-you');
    if (top) openSheet(top.id);
    else input.focus();
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  build();
  start();
  window.__island = { refresh, start, stop };
})();

/* ============================================================
   The company brain — Allya's model of the business, made touchable.
   A labeled graph: a hub (your company), its departments, and the
   concrete things under them (some mapped to live WORK). It holds a
   clean shape, drifts gently, fires "thoughts" along its edges, and
   reacts to touch — hover excites a node and ripples to neighbours,
   drag moves it 1:1, tap sends a thought. Data-driven per client.
   ============================================================ */
(function companyBrain() {
  const canvas = document.getElementById('brainCanvas');
  const box = document.getElementById('brainBox');
  if (!canvas || !box) return;
  const ctx = canvas.getContext('2d');

  // ---- graph: groups carry a restrained tint; leaves inherit their dept ----
  const GROUPS = {
    core:      '#91d45f',
    marketing: '#91d45f',
    hiring:    '#d9a441',
    pr:        '#a78bda',
    sales:     '#5fbfa8',
    ops:       '#6f9fd8',
  };
  const DEF = {
    nodes: [
      { id: 'co', label: 'Your company', tier: 0, group: 'core' },
      { id: 'marketing', label: 'Marketing', tier: 1, group: 'marketing', parent: 'co' },
      { id: 'hiring', label: 'Hiring', tier: 1, group: 'hiring', parent: 'co' },
      { id: 'pr', label: 'PR', tier: 1, group: 'pr', parent: 'co' },
      { id: 'sales', label: 'Sales', tier: 1, group: 'sales', parent: 'co' },
      { id: 'ops', label: 'Ops', tier: 1, group: 'ops', parent: 'co' },
      { id: 'newsletter', label: 'Newsletter', tier: 2, group: 'marketing', parent: 'marketing', work: 'newsletter' },
      { id: 'campaigns', label: 'Campaigns', tier: 2, group: 'marketing', parent: 'marketing' },
      { id: 'seo', label: 'SEO', tier: 2, group: 'marketing', parent: 'marketing' },
      { id: 'candidates', label: 'Candidates', tier: 2, group: 'hiring', parent: 'hiring', work: 'screening' },
      { id: 'jd', label: 'JD', tier: 2, group: 'hiring', parent: 'hiring', work: 'jd' },
      { id: 'presslist', label: 'Press list', tier: 2, group: 'pr', parent: 'pr', work: 'press' },
      { id: 'journalists', label: 'Journalists', tier: 2, group: 'pr', parent: 'pr' },
      { id: 'leads', label: 'Leads', tier: 2, group: 'sales', parent: 'sales', work: 'leads' },
      { id: 'crm', label: 'CRM', tier: 2, group: 'sales', parent: 'sales', work: 'crm' },
      { id: 'pipeline', label: 'Pipeline', tier: 2, group: 'sales', parent: 'sales' },
      { id: 'calendar', label: 'Calendar', tier: 2, group: 'ops', parent: 'ops' },
      { id: 'docs', label: 'Docs', tier: 2, group: 'ops', parent: 'ops' },
    ],
    // cross-links add richness beyond the parent tree
    cross: [['leads', 'campaigns'], ['journalists', 'presslist'], ['pipeline', 'crm'], ['calendar', 'candidates']],
  };

  const byId = {};
  DEF.nodes.forEach(n => (byId[n.id] = n));
  const edges = [];
  DEF.nodes.forEach(n => { if (n.parent) edges.push([n.parent, n.id]); });
  DEF.cross.forEach(([a, b]) => edges.push([a, b]));

  let W = 0, H = 0, dpr = 1;
  let pulses = [], thoughtClock = 0, tSeed = Math.random() * 1000;
  const nodes = DEF.nodes.map(n => ({ ...n, x: 0, y: 0, hx: 0, hy: 0, vx: 0, vy: 0, ex: 0, phase: Math.random() * Math.PI * 2 }));
  const nodeById = {}; nodes.forEach(n => (nodeById[n.id] = n));

  function layout() {
    const cx = W / 2, cy = H / 2;
    const rx1 = W * 0.24, ry1 = H * 0.30, rx2 = W * 0.42, ry2 = H * 0.40;
    const depts = nodes.filter(n => n.tier === 1);
    depts.forEach((d, i) => {
      const a = (-Math.PI / 2) + (i / depts.length) * Math.PI * 2;
      d.hx = cx + Math.cos(a) * rx1; d.hy = cy + Math.sin(a) * ry1; d._a = a;
    });
    depts.forEach(d => {
      const leaves = nodes.filter(n => n.parent === d.id);
      leaves.forEach((l, j) => {
        const spread = (j - (leaves.length - 1) / 2) * 0.42;
        const a = d._a + spread;
        l.hx = cx + Math.cos(a) * rx2; l.hy = cy + Math.sin(a) * ry2;
      });
    });
    const hub = nodeById.co; hub.hx = cx; hub.hy = cy;
    // seed positions at home the first time
    nodes.forEach(n => { if (n.x === 0 && n.y === 0) { n.x = n.hx; n.y = n.hy; } });
  }

  function resize() {
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = w; H = h;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
    return true;
  }

  const R = { 0: 6.5, 1: 4.6, 2: 3.2 };
  function nodeR(n) { return R[n.tier] * (1 + n.ex * 0.6); }

  function excite(n, amt) { n.ex = clamp(n.ex + amt, 0, 1.4); }

  function fireEdge(a, b, delay) { pulses.push({ a: nodeById[a.id ? a.id : a], b: nodeById[b.id ? b.id : b], delay: delay || 0, t: 0, dur: 0.5 + Math.random() * 0.25 }); }

  function pathToHub(n) {
    const path = []; let cur = n;
    while (cur) { path.push(cur); cur = cur.parent ? nodeById[cur.parent] : null; }
    return path.reverse();   // hub → … → n
  }
  function fireThought(target) {
    const t = target || pickThoughtTarget();
    const path = pathToHub(t);
    for (let i = 0; i < path.length - 1; i++) fireEdge(path[i], path[i + 1], i * 0.16);
    excite(path[0], 0.5);
  }
  function pickThoughtTarget() {
    // bias toward nodes with live work
    const live = nodes.filter(n => n.work && WORK.find(w => w.id === n.work && w.status !== 'shipped'));
    const pool = live.length && Math.random() < 0.6 ? live : nodes.filter(n => n.tier === 2);
    return pool[(Math.random() * pool.length) | 0];
  }

  // ---- interaction ----
  let hoverNode = null, dragNode = null, grabDX = 0, grabDY = 0, pHist = [];
  function nodeAt(px, py) {
    let best = null, bestD = 1e9;
    for (const n of nodes) {
      const d = Math.hypot(px - n.x, py - n.y);
      const hit = nodeR(n) + 13;
      if (d < hit && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }
  function localPt(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = localPt(e);
    if (dragNode) {
      dragNode.x = px - grabDX; dragNode.y = py - grabDY; dragNode.vx = dragNode.vy = 0;
      pHist.push({ t: performance.now(), x: px, y: py }); if (pHist.length > 5) pHist.shift();
      return;
    }
    const n = nodeAt(px, py);
    if (n !== hoverNode) {
      hoverNode = n;
      if (n) { excite(n, 0.7); nodes.filter(m => edges.some(([a, b]) => (byName(a) === n.id && byName(b) === m.id) || (byName(b) === n.id && byName(a) === m.id))).forEach(m => fireEdge(n, m, 0)); }
    }
    canvas.style.cursor = n ? 'pointer' : 'grab';
  });
  function byName(x) { return x; }
  canvas.addEventListener('pointerdown', (e) => {
    const [px, py] = localPt(e);
    const n = nodeAt(px, py);
    if (n) {
      dragNode = n; grabDX = px - n.x; grabDY = py - n.y;
      pHist = [{ t: performance.now(), x: px, y: py }];
      canvas.setPointerCapture(e.pointerId);
      excite(n, 0.5);
    } else {
      fireThought();   // tap on empty space — Allya puts a thought
    }
  });
  function endDrag() {
    if (!dragNode) return;
    // hand release velocity back to the node, then it springs home
    if (pHist.length > 1) {
      const a = pHist[0], b = pHist[pHist.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt > 0) { dragNode.vx = (b.x - a.x) / dt * 0.02; dragNode.vy = (b.y - a.y) / dt * 0.02; }
    }
    const moved = pHist.length > 1 && Math.hypot(pHist[pHist.length - 1].x - pHist[0].x, pHist[pHist.length - 1].y - pHist[0].y);
    if (!moved || moved < 4) fireThought(dragNode);   // it was a tap
    dragNode = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { hoverNode = null; });

  // ---- simulation + draw ----
  const K_HOME = 34, K_EDGE = 10, DAMP = 5.2;
  function step(dt) {
    // gentle drift of home targets keeps it alive
    const time = performance.now() / 1000 + tSeed;
    for (const n of nodes) {
      if (n === dragNode) continue;
      const driftX = Math.sin(time * 0.5 + n.phase) * (n.tier === 0 ? 1.5 : 4);
      const driftY = Math.cos(time * 0.42 + n.phase) * (n.tier === 0 ? 1.5 : 4);
      const tx = n.hx + driftX, ty = n.hy + driftY;
      let ax = (tx - n.x) * K_HOME, ay = (ty - n.y) * K_HOME;
      n.vx += ax * dt; n.vy += ay * dt;
    }
    // edge springs — the web reacts when a node is pulled
    for (const [aid, bid] of edges) {
      const a = nodeById[aid], b = nodeById[bid];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const rest = Math.hypot(b.hx - a.hx, b.hy - a.hy);
      const f = (d - rest) * K_EDGE;
      const ux = dx / d, uy = dy / d;
      if (a !== dragNode) { a.vx += ux * f * dt; a.vy += uy * f * dt; }
      if (b !== dragNode) { b.vx -= ux * f * dt; b.vy -= uy * f * dt; }
    }
    const fr = Math.exp(-DAMP * dt);
    for (const n of nodes) {
      if (n === dragNode) continue;
      n.vx *= fr; n.vy *= fr;
      n.x += n.vx * dt; n.y += n.vy * dt;
    }
    for (const n of nodes) n.ex = Math.max(0, n.ex - dt * 1.1);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // edges
    for (const [aid, bid] of edges) {
      const a = nodeById[aid], b = nodeById[bid];
      const lit = Math.max(a.ex, b.ex);
      ctx.strokeStyle = `rgba(145, 212, 95, ${0.07 + lit * 0.22})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // pulses (thoughts travelling edges)
    for (const s of pulses) {
      if (s.delay > 0) continue;
      const x = s.a.x + (s.b.x - s.a.x) * s.t, y = s.a.y + (s.b.y - s.a.y) * s.t;
      const fade = Math.sin(clamp(s.t, 0, 1) * Math.PI);
      ctx.fillStyle = `rgba(180, 232, 138, ${0.85 * fade})`;
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // nodes + labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const n of nodes) {
      const col = GROUPS[n.group] || '#91d45f';
      const r = nodeR(n);
      const liveWork = n.work && WORK.find(w => w.id === n.work && w.status === 'needs-you');
      const base = n.tier === 0 ? 0.95 : n.tier === 1 ? 0.7 : 0.42;
      const alpha = clamp(base + n.ex * 0.5, 0, 1);
      if (n.ex > 0.02 || liveWork) {
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 6 + n.ex * 4, 0, Math.PI * 2);
        ctx.fillStyle = hexA(liveWork ? '#91d45f' : col, 0.10 + n.ex * 0.14); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = hexA(col, alpha); ctx.fill();
      if (n.tier === 0) { ctx.lineWidth = 1.5; ctx.strokeStyle = hexA('#b4e88a', 0.7); ctx.stroke(); }
      // label
      const lAlpha = clamp((n.tier === 0 ? 0.85 : n.tier === 1 ? 0.5 : 0.28) + n.ex * 0.7, 0, 1);
      ctx.font = `${n.tier === 0 ? 600 : 500} ${n.tier === 0 ? 12 : n.tier === 1 ? 11 : 10}px "Inter Tight", sans-serif`;
      ctx.fillStyle = hexA(n.tier === 2 ? '#c7ccd4' : '#f3f4f6', lAlpha);
      ctx.fillText(n.label, n.x, n.y + r + 3);
    }
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
  }

  let raf = 0, last = 0;
  function frame(now) {
    if (!raf) return;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    if (!box.offsetParent) { raf = requestAnimationFrame(frame); return; }   // hidden (chatting)
    if (W !== box.clientWidth || H !== box.clientHeight) resize();
    if (!reduceMotion) {
      step(dt);
      // advance thoughts
      thoughtClock += dt;
      if (thoughtClock > 2.6) { thoughtClock = 0; fireThought(); }
      for (const s of pulses) { if (s.delay > 0) { s.delay -= dt; } else { s.t += dt / s.dur; if (s.t >= 0.5 && !s._hit) { s._hit = true; excite(s.b, 0.6); } } }
      pulses = pulses.filter(s => s.t < 1);
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (raf) return;
    if (!resize()) { requestAnimationFrame(start); return; }
    if (reduceMotion) { draw(); return; }   // static graph, no loop
    last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  window.addEventListener('resize', () => { if (resize() && reduceMotion) draw(); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();
  window.__brain = { start, stop, fireThought, nodes };
})();

/* boot */
renderWork();
seedChat();
