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
    who: 'A', whoName: 'Allya', whoRole: 'with Priya, your PR expert',
    say: 'Next week’s newsletter is drafted around the SurferSearcher result. Priya’s edits are in. Read it before it ships?' },
  { id: 'leads', status: 'running', origin: 'agent',
    title: 'Enriching 40 leads from last week’s signups', meta: 'agent · ~8 min left' },
  { id: 'screening', status: 'running', origin: 'agent',
    title: 'Screening 6 candidates for the ops role', meta: 'agent · ranking against your approved JD' },
  { id: 'press', status: 'running', origin: 'expert',
    title: 'Press list — 22 journalists, matched to your space', meta: 'with Priya · final pass' },
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
      <div class="w-copy"><div class="t">${w.title}</div><div class="s">${w.meta}</div></div>
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
  document.getElementById('statusText').textContent =
    `${running} agent${running === 1 ? '' : 's'} running` + (needs ? ` · ${needs} needs you` : '');
  const badge = document.getElementById('tabBadge');
  badge.textContent = needs ? `·${needs}` : '';
}

/* move an item to shipped with a small spring entrance on its new row */
function shipItem(id, newTitle, newMeta) {
  const w = WORK.find(x => x.id === id);
  if (!w) return;
  w.status = 'shipped';
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
        addMsg('allya', `I broke it into three: subject lines, the body, and a P.S. that asks for one reply. Two of Priya's edits are already in. It's waiting in your work panel.`);
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
        addMsg('human', `I sat in on the top two — both worth 20 minutes of your time. I've held Thursday 3pm and 4pm.`, { tag: `Priya <span class="human-tag">· your hiring expert</span>` });
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
function submitComposer() { if (!input.value.trim()) return; sendText(input.value); input.value = ''; }
sendBtn.addEventListener('click', submitComposer);
input.addEventListener('keydown', e => { if (e.key === 'Enter') submitComposer(); });

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
        <div class="who">Allya <span class="role">· with Priya, your PR expert</span></div>
        <div class="line">Next week’s newsletter. Read it, then approve — nothing sends until you do.</div>
      </div>`;
    body.innerHTML = `
      ${draft('Subject line', 'The agency did 13 campaigns. In one month.',
        'Leads with the SurferSearcher number. No adjectives — the figure carries it.', ['open rate angle', 'A/B ready'])}
      ${draft('Body', 'You didn’t start a company to write newsletters at 11pm.',
        'Three short paragraphs. One idea each. Ends on your actual offer, not a pitch.', ['your voice', 'Priya edited'])}
      ${draft('P.S.', 'Reply with one word — the thing eating your week. I’ll take it from there.',
        'Asks for a single reply so you can start real conversations, not track opens.', ['1 reply goal'])}`;
    document.getElementById('approveLabel').textContent = 'Approve — schedule it';
  } else {
    head.innerHTML = `
      <div class="avatar human">P</div>
      <div>
        <div class="who">Priya <span class="role">· your hiring expert</span></div>
        <div class="line">Six through the first screen. Here are the two I’d spend your time on.</div>
      </div>`;
    body.innerHTML = `
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

/* approve → commit cue + item moves to Shipped + chat beat */
const shipped = document.getElementById('shipped');
document.getElementById('approveBtn').addEventListener('click', () => {
  haptic([12, 40, 18]);
  const ctx = sheetContext;
  closeSheet(700);
  setTimeout(() => {
    if (ctx === 'newsletter') {
      shipItem('newsletter', 'Newsletter approved — goes out Tuesday 9am', 'just now · you approved');
      toast('Scheduled. It goes out Tuesday 9am.');
      addMsg('you', 'Approved');
      typing(() => addMsg('allya', `Scheduled for Tuesday 9am. I’ll watch the replies and pull anything worth your time into here.`), 700);
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
  const el = e.target.closest('[data-open-sheet]');
  if (el) { e.stopPropagation(); openSheet(el.dataset.openSheet); }
});

/* boot */
renderWork();
seedChat();
