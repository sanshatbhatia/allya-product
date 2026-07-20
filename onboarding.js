/* ============================================================
   Allya — onboarding
   A conversation that builds a live model of the company as you
   answer, then synthesises "what Allya can do for you" from what
   you said and hands off into the workspace.

   Three parts:
     1. Spring       — the same Apple-fluid engine as the workspace
     2. GrowBrain    — a force-directed company graph that GROWS one
                       cluster per answer (the star of the show)
     3. Flow         — screens, questions, synthesis, showcase, hand-off
   ============================================================ */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

/* ---- Spring: response + damping, numerically integrated, interruptible ---- */
class Spring {
  constructor(value, { response = 0.4, damping = 1.0, onframe } = {}) {
    this.x = value; this.v = 0; this.target = value;
    this.response = response; this.damping = damping; this.onframe = onframe;
    this.running = false; this._raf = 0; this._last = 0;
  }
  to(target, velocity) {
    this.target = target;
    if (velocity != null) this.v = velocity;
    if (reduceMotion) { this.x = target; this.v = 0; this.onframe && this.onframe(this.x, this.v, true); return this; }
    this._start(); return this;
  }
  _start() {
    if (this.running) return;
    this.running = true; this._last = performance.now();
    const step = (now) => {
      if (!this.running) return;
      let dt = (now - this._last) / 1000; this._last = now;
      if (dt > 1 / 30) dt = 1 / 30;
      const w = (2 * Math.PI) / this.response, k = w * w, c = 2 * this.damping * w;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const a = -k * (this.x - this.target) - c * this.v;
        this.v += a * h; this.x += this.v * h;
      }
      const settled = Math.abs(this.x - this.target) < 0.001 && Math.abs(this.v) < 0.001;
      if (settled) { this.x = this.target; this.v = 0; this.running = false; }
      this.onframe && this.onframe(this.x, this.v, settled);
      if (this.running) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
  stop() { this.running = false; cancelAnimationFrame(this._raf); return this; }
}

function pressable(el, scale = 0.96) {
  const s = new Spring(1, { response: 0.28, damping: 0.75, onframe: (v) => { el.style.transform = `scale(${v})`; } });
  el.addEventListener('pointerdown', () => s.to(scale));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => s.to(1)));
}

/* fade+rise a freshly shown element. Uses CSS transitions (not rAF) so
   it still resolves if the tab is backgrounded / throttled. */
function riseIn(el, dy = 16, delay = 0) {
  if (reduceMotion) return;
  el.style.opacity = '0';
  el.style.transform = `translateY(${dy}px)`;
  setTimeout(() => {
    el.style.transition = 'opacity .5s cubic-bezier(.22,1,.36,1), transform .5s cubic-bezier(.22,1,.36,1)';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    setTimeout(() => { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; }, 560);
  }, delay + 20);
}

/* ============================================================
   The growing company brain
   Starts as a single hub and gains a labelled cluster with every
   answer. Same visual language as the workspace brain: gradient
   strands, luminous nodes, ripples, and "thoughts" that fire along
   the edges — but here the graph is assembled live.
   ============================================================ */
const GROUPS = {
  core: '#91d45f', marketing: '#91d45f', sales: '#5fbfa8', hiring: '#d9a441',
  pr: '#a78bda', ops: '#6f9fd8', market: '#6f9fd8', customer: '#5fbfa8',
  revenue: '#d9a441', goals: '#91d45f', edge: '#a78bda',
};
const TAU = Math.PI * 2;

function makeBrain(canvas, box) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, S = 1;
  const nodes = [];          // { id,label,tier,group,parent,x,y,hx,hy,vx,vy,ex,rev,phase }
  const nodeById = {};
  const edges = [];          // [aid, bid]
  let pulses = [], ripples = [], thoughtClock = 0;
  const tSeed = Math.random() * 1000;

  const R = { 0: 8.5, 1: 5, 2: 3.3 };
  const nodeR = (n) => R[n.tier] * S * (0.2 + n.rev * 0.8) * (1 + n.ex * 0.5);

  function resize() {
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);   // capped — 2x quadruples pixel work
    W = w; H = h; S = clamp(Math.min(W, H) / 300, 0.85, 1.7);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
    return true;
  }

  /* home positions — hub centred; tier-1 nodes spread evenly on an ellipse
     by their appearance order; leaves fan outward around their parent */
  function layout() {
    const cx = W / 2, cy = H / 2;
    const rx1 = W * 0.26, ry1 = H * 0.30, rx2 = W * 0.19, ry2 = H * 0.20;
    const hub = nodeById.co; if (hub) { hub.hx = cx; hub.hy = cy; }
    const t1 = nodes.filter(n => n.tier === 1);
    t1.forEach((d, i) => {
      const a = (-Math.PI / 2) + (i / Math.max(1, t1.length)) * TAU;
      d.hx = cx + Math.cos(a) * rx1; d.hy = cy + Math.sin(a) * ry1; d._a = a;
    });
    t1.forEach(d => {
      const leaves = nodes.filter(n => n.parent === d.id);
      const gap = leaves.length > 3 ? 0.34 : 0.5;          // tighter fan when a node has many leaves
      const reach = leaves.length > 3 ? 1.25 : 1;          // push them out a touch so they don't crowd the hub
      leaves.forEach((l, j) => {
        const a = d._a + (j - (leaves.length - 1) / 2) * gap;
        l.hx = d.hx + Math.cos(a) * rx2 * reach; l.hy = d.hy + Math.sin(a) * ry2 * reach;
      });
    });
  }

  function addNode(spec, spawnFrom) {
    const parent = spawnFrom ? nodeById[spawnFrom] : null;
    const n = {
      id: spec.id, label: spec.label, tier: spec.tier, group: spec.group,
      parent: spec.parent, x: parent ? parent.x : W / 2, y: parent ? parent.y : H / 2,
      hx: W / 2, hy: H / 2, vx: 0, vy: 0, ex: 0, rev: 0, phase: Math.random() * TAU,
    };
    nodes.push(n); nodeById[n.id] = n;
    if (spec.parent && nodeById[spec.parent]) edges.push([spec.parent, n.id]);
    new Spring(0, { response: 0.62, damping: 0.72, onframe: (p) => { n.rev = p; } }).to(1);
    return n;
  }

  function excite(n, amt) {
    n.ex = clamp(n.ex + amt, 0, 1.4);
    if (amt >= 0.5) ripples.push({ x: n.x, y: n.y, col: GROUPS[n.group] || '#91d45f', t: 0, r0: nodeR(n) });
  }
  function fireEdge(a, b, delay) { pulses.push({ a, b, delay: delay || 0, t: 0, dur: 0.5 + Math.random() * 0.25 }); }
  function pathToHub(n) { const p = []; let c = n; while (c) { p.push(c); c = c.parent ? nodeById[c.parent] : null; } return p.reverse(); }
  function fireThought(target) {
    const t = target || (nodes.filter(n => n.tier === 2).slice(-1)[0]) || nodes[nodes.length - 1];
    if (!t) return;
    const path = pathToHub(t);
    for (let i = 0; i < path.length - 1; i++) fireEdge(path[i], path[i + 1], i * 0.15);
    if (path[0]) excite(path[0], 0.5);
  }

  // ---- public: seed the hub, then grow clusters ----
  function seedHub(label) {
    if (!resize()) { requestAnimationFrame(() => seedHub(label)); return; }
    addNode({ id: 'co', label: label || 'Your company', tier: 0, group: 'core' }, null);
    layout(); const hub = nodeById.co; hub.x = hub.hx; hub.y = hub.hy;
    excite(hub, 0.6); start();
  }
  function setHubLabel(label) { if (nodeById.co) nodeById.co.label = label || 'Your company'; }

  /* grow: add a tier-1 node under the hub plus its leaves, animate in,
     then send a thought out to each new leaf */
  function grow(cluster) {
    resize();
    addNode({ id: cluster.id, label: cluster.label, tier: 1, group: cluster.group, parent: 'co' }, 'co');
    const leaves = (cluster.leaves || []).filter(Boolean).slice(0, 5);
    leaves.forEach((lf, i) => addNode({ id: cluster.id + '_l' + i, label: lf, tier: 2, group: cluster.group, parent: cluster.id }, cluster.id));
    layout();
    excite(nodeById[cluster.id], 0.9);
    const top = nodeById[cluster.id];
    setTimeout(() => fireThought(top), 90);
    leaves.forEach((_, i) => setTimeout(() => fireThought(nodeById[cluster.id + '_l' + i]), 240 + i * 200));
  }
  function bloom() { nodes.filter(n => n.tier === 2).forEach((n, i) => setTimeout(() => fireThought(n), i * 90)); }

  // ---- interaction: hover excites, drag moves, empty tap fires a thought ----
  let hoverNode = null, dragNode = null, grabDX = 0, grabDY = 0, pHist = [];
  function nodeAt(px, py) {
    let best = null, bestD = 1e9;
    for (const n of nodes) { const d = Math.hypot(px - n.x, py - n.y), hit = nodeR(n) + 14; if (d < hit && d < bestD) { best = n; bestD = d; } }
    return best;
  }
  const localPt = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = localPt(e);
    if (dragNode) { dragNode.x = px - grabDX; dragNode.y = py - grabDY; dragNode.vx = dragNode.vy = 0; pHist.push({ t: performance.now(), x: px, y: py }); if (pHist.length > 5) pHist.shift(); return; }
    const n = nodeAt(px, py);
    if (n !== hoverNode) { hoverNode = n; if (n) { excite(n, 0.7); if (n.parent) fireEdge(nodeById[n.parent], n, 0); } }
    canvas.style.cursor = n ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerdown', (e) => {
    const [px, py] = localPt(e); const n = nodeAt(px, py);
    if (n) { dragNode = n; grabDX = px - n.x; grabDY = py - n.y; pHist = [{ t: performance.now(), x: px, y: py }]; canvas.setPointerCapture(e.pointerId); excite(n, 0.5); }
    else fireThought();
  });
  function endDrag() {
    if (!dragNode) return;
    if (pHist.length > 1) { const a = pHist[0], b = pHist[pHist.length - 1], dt = (b.t - a.t) / 1000; if (dt > 0) { dragNode.vx = (b.x - a.x) / dt * 0.02; dragNode.vy = (b.y - a.y) / dt * 0.02; } }
    const moved = pHist.length > 1 && Math.hypot(pHist[pHist.length - 1].x - pHist[0].x, pHist[pHist.length - 1].y - pHist[0].y);
    if (!moved || moved < 4) fireThought(dragNode);
    dragNode = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { hoverNode = null; });

  // ---- simulation + draw ----
  const K_HOME = 34, K_EDGE = 10, DAMP = 5.2;
  function sim(dt) {
    const time = performance.now() / 1000 + tSeed;
    for (const n of nodes) {
      if (n === dragNode) continue;
      const amp = n.tier === 0 ? 1.5 : 4;
      const tx = n.hx + Math.sin(time * 0.5 + n.phase) * amp;
      const ty = n.hy + Math.cos(time * 0.42 + n.phase) * amp;
      n.vx += (tx - n.x) * K_HOME * dt; n.vy += (ty - n.y) * K_HOME * dt;
    }
    for (const [aid, bid] of edges) {
      const a = nodeById[aid], b = nodeById[bid];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001;
      const rest = Math.hypot(b.hx - a.hx, b.hy - a.hy);
      const f = (d - rest) * K_EDGE, ux = dx / d, uy = dy / d;
      if (a !== dragNode) { a.vx += ux * f * dt; a.vy += uy * f * dt; }
      if (b !== dragNode) { b.vx -= ux * f * dt; b.vy -= uy * f * dt; }
    }
    const fr = Math.exp(-DAMP * dt);
    for (const n of nodes) { if (n === dragNode) continue; n.vx *= fr; n.vy *= fr; n.x += n.vx * dt; n.y += n.vy * dt; }
    for (const n of nodes) n.ex = Math.max(0, n.ex - dt * 1.1);
  }

  function hexA(hex, a) { const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; }
  function lighten(hex) { const h = hex.replace('#', ''); const m = (c) => Math.round(c + (255 - c) * 0.4); return `#${m(parseInt(h.slice(0, 2), 16)).toString(16).padStart(2, '0')}${m(parseInt(h.slice(2, 4), 16)).toString(16).padStart(2, '0')}${m(parseInt(h.slice(4, 6), 16)).toString(16).padStart(2, '0')}`; }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const time = performance.now() / 1000;
    for (const [aid, bid] of edges) {
      const a = nodeById[aid], b = nodeById[bid];
      const vis = Math.min(a.rev, b.rev), lit = Math.max(a.ex, b.ex);
      if (lit > 0.03) {   // gradient strands only while lit — resting edges get a flat faint stroke
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, hexA(GROUPS[a.group] || '#91d45f', (0.05 + a.ex * 0.3 + lit * 0.08) * vis));
        g.addColorStop(1, hexA(GROUPS[b.group] || '#91d45f', (0.05 + b.ex * 0.3 + lit * 0.08) * vis));
        ctx.strokeStyle = g;
      } else {
        ctx.strokeStyle = hexA(GROUPS[a.group] || '#91d45f', 0.05 * vis);
      }
      ctx.lineWidth = (0.8 + lit * 1.2) * S;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const rp of ripples) {
      const rr = rp.r0 + rp.t * 42 * S;
      ctx.strokeStyle = hexA(rp.col, (1 - rp.t) * 0.4); ctx.lineWidth = 1.4 * S;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rr, 0, TAU); ctx.stroke();
    }
    for (const s of pulses) {
      if (s.delay > 0) continue;
      const t = clamp(s.t, 0, 1);
      const x = s.a.x + (s.b.x - s.a.x) * t, y = s.a.y + (s.b.y - s.a.y) * t;
      const tt = Math.max(0, t - 0.16), px = s.a.x + (s.b.x - s.a.x) * tt, py = s.a.y + (s.b.y - s.a.y) * tt;
      const fade = Math.sin(t * Math.PI);
      const tg = ctx.createLinearGradient(px, py, x, y);
      tg.addColorStop(0, hexA('#b4e88a', 0)); tg.addColorStop(1, hexA('#b4e88a', 0.6 * fade));
      ctx.strokeStyle = tg; ctx.lineWidth = 2 * S; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      const hg = ctx.createRadialGradient(x, y, 0, x, y, 7 * S);
      hg.addColorStop(0, hexA('#eafbdc', 0.95 * fade)); hg.addColorStop(1, hexA('#91d45f', 0));
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, 7 * S, 0, TAU); ctx.fill();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const n of nodes) {
      if (n.rev < 0.02) continue;
      const col = GROUPS[n.group] || '#91d45f', hub = n.tier === 0;
      const r = nodeR(n) * (hub ? 1 + 0.05 * Math.sin(time * 1.6) : 1);
      const glow = (hub ? 1 : 0) + n.ex;
      if (hub || glow > 0.03) {   // resting halos are ~5% alpha — skip the gradient
        const haloR = r + (hub ? 26 : 11) * S + n.ex * 12 * S;
        const hg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, haloR);
        hg.addColorStop(0, hexA(col, (0.05 + glow * 0.16) * n.rev)); hg.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(n.x, n.y, haloR, 0, TAU); ctx.fill();
      }
      const base = (hub ? 0.98 : n.tier === 1 ? 0.74 : 0.5) * n.rev;
      if (n.tier === 2 && n.ex < 0.02) {
        ctx.fillStyle = hexA(col, base);   // flat fill for resting leaves
      } else {
        const cg = ctx.createRadialGradient(n.x - r * 0.3, n.y - r * 0.3, 0, n.x, n.y, r);
        cg.addColorStop(0, hexA(lighten(col), clamp(base + n.ex * 0.5, 0, 1))); cg.addColorStop(1, hexA(col, clamp(base + n.ex * 0.4, 0, 1)));
        ctx.fillStyle = cg;
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
      if (hub) { ctx.lineWidth = 1.5 * S; ctx.strokeStyle = hexA('#eafbdc', 0.6 * n.rev); ctx.stroke(); }
      const lAlpha = clamp(((hub ? 0.92 : n.tier === 1 ? 0.62 : 0.4) + n.ex * 0.7) * n.rev, 0, 1);
      ctx.font = `${hub ? 600 : 500} ${(hub ? 13 : n.tier === 1 ? 11.5 : 10) * clamp(S, 0.9, 1.25)}px "Inter Tight", system-ui, sans-serif`;
      ctx.fillStyle = hexA(n.tier === 2 ? '#c7ccd4' : '#f3f4f6', lAlpha);
      ctx.fillText(n.label, n.x, n.y + r + 3 * S);
    }
  }

  let raf = 0, last = 0, thoughtsOn = true, boxHidden = false, probeAt = 0;
  function frame(now) {
    if (!raf) return;
    raf = requestAnimationFrame(frame);
    // layout probes force reflow — twice a second is plenty
    if (now >= probeAt) {
      probeAt = now + 500;
      boxHidden = !box.offsetParent;
      if (!boxHidden && (W !== box.clientWidth || H !== box.clientHeight)) resize();
    }
    if (boxHidden) { last = now; return; }
    // 30fps while something is happening, ~15fps for the idle drift
    const active = dragNode || hoverNode || pulses.length || ripples.length ||
      nodes.some(n => n.ex > 0.02 || n.rev < 0.98);
    if (now - last < (active ? 33 : 66)) return;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.08) dt = 0.08;
    if (!reduceMotion) {
      const sub = dt > 0.04 ? 2 : 1;   // substep keeps springs stable at low fps
      for (let i = 0; i < sub; i++) sim(dt / sub);
      thoughtClock += dt;
      if (thoughtsOn && thoughtClock > 4.5 && nodes.length > 1) { thoughtClock = 0; fireThought(); }
      for (const s of pulses) { if (s.delay > 0) s.delay -= dt; else { s.t += dt / s.dur; if (s.t >= 0.5 && !s._hit) { s._hit = true; excite(s.b, 0.6); } } }
      pulses = pulses.filter(s => s.t < 1);
      for (const rp of ripples) rp.t += dt / 0.7;
      ripples = ripples.filter(rp => rp.t < 1);
    }
    draw();
  }
  function start() { if (raf) return; if (!resize()) { requestAnimationFrame(start); return; } if (reduceMotion) { draw(); return; } last = performance.now(); probeAt = 0; raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  window.addEventListener('resize', () => { if (resize() && reduceMotion) draw(); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  return { seedHub, setHubLabel, grow, bloom, fireThought, start, stop,
    setThoughts(v) { thoughtsOn = v; }, get nodeCount() { return nodes.length; } };
}

/* ============================================================
   Questions — the six from the flow, in Allya's voice, each wired
   to the cluster it grows in the brain and the status it shows.
   ============================================================ */
const QUESTIONS = [
  { key: 'business', tag: 'The business', sub: 'Mapping your business',
    q: 'Tell me about your business — what do you do, and who is it for? Say as much as you like; detail makes me sharper.',
    type: 'long', placeholder: 'e.g. We build a scheduling tool for independent salons — booking, reminders, and payments in one app…',
    example: 'We run a D2C coffee brand selling single-origin beans by subscription, plus wholesale to cafés.',
    ack: () => "That's a clear picture. I'm mapping it now — watch it take shape on the right.",
    cluster: () => ({ id: 'business', label: 'Business', group: 'marketing',
      leaves: ['Marketing', 'Sales', 'Hiring', 'PR', 'Ops'] }) },

  { key: 'market', tag: 'Your market', sub: 'Placing you in your market',
    q: 'Who do you sell to — other businesses, everyday consumers, or both?',
    type: 'choice', options: ['Businesses', 'Consumers', 'Both'],
    ack: (a) => a === 'Businesses'
      ? 'Businesses it is. That changes who I chase and how I write to them.'
      : a === 'Consumers'
        ? 'Consumers — so volume and voice matter more than long sales cycles. Noted.'
        : "Both, then. I'll keep two tones ready — they don't respond to the same things.",
    cluster: (a) => ({ id: 'market', label: 'Market', group: 'market',
      leaves: [a === 'Businesses' ? 'B2B' : a === 'Consumers' ? 'B2C' : 'B2B + B2C'] }) },

  { key: 'customer', tag: 'Your customer', sub: 'Profiling your customer',
    q: 'In one line — who is your ideal customer?',
    type: 'short', placeholder: 'e.g. Seed-stage SaaS founders with a small team and no marketing hire',
    example: 'Busy salon owners running 2–5 chairs who hate admin.',
    ack: () => "Good — knowing exactly who we're for saves us both a lot of wasted work.",
    cluster: (a) => ({ id: 'customer', label: 'Customer', group: 'customer',
      leaves: splitLeaves(a, 2) }) },

  { key: 'revenue', tag: 'Your revenue', sub: 'Analysing your revenue',
    q: "Roughly, what's your monthly revenue right now? A range is completely fine.",
    type: 'short', placeholder: 'e.g. around ₹3–4L / month, mostly subscriptions',
    example: 'About $8k MRR, growing ~10% month over month.',
    ack: () => 'Thank you. That tells me what to push on now and what can wait.',
    cluster: (a) => ({ id: 'revenue', label: 'Revenue', group: 'revenue',
      leaves: [revenueStage(a).badge] }) },

  { key: 'goals', tag: 'Your goals', sub: 'Locking in your goals',
    q: 'What are your top 3 objectives for the next 6–12 months?',
    type: 'long', placeholder: '1. Hit ₹10L MRR\n2. Hire an ops lead\n3. Launch in two new cities',
    example: '1. Double paying customers\n2. Hire a first salesperson\n3. Get press in two industry outlets',
    ack: (a) => {
      const n = splitGoals(a).length;
      return n > 1
        ? `${n} things to aim at. I'll keep bringing us back to these.`
        : "That's the one to aim at. I'll keep bringing us back to it.";
    },
    cluster: (a) => ({ id: 'goals', label: 'Goals', group: 'goals',
      leaves: splitGoals(a).map(shortLabel) }) },

  { key: 'edge', tag: 'Your edge', sub: 'Finding your edge',
    q: 'Last one — what makes you different from your competitors?',
    type: 'long', placeholder: 'e.g. We are the only one that does same-day setup, and our support is human, not a bot…',
    example: "We're the only one built for solo operators — everyone else targets big teams.",
    ack: () => "That's everything I need. Give me a moment — I'm putting your company together.",
    cluster: (a) => ({ id: 'edge', label: 'Edge', group: 'edge',
      leaves: [shortLabel(a)] }) },
];

/* ============================================================
   Flow
   ============================================================ */
const answers = {};
let companyName = '';
let idx = -1;                 // -1 = name step, 0..5 = questions
let brain = null;

const el = (id) => document.getElementById(id);
const screens = {
  intro: el('screenIntro'), ask: el('screenAsk'), synth: el('screenSynth'), show: el('screenShow'),
};
function showScreen(name) {
  Object.entries(screens).forEach(([k, s]) => { s.hidden = k !== name; });
}

/* ---- intro → ask ---- */
pressable(el('startBtn'), 0.96);
el('startBtn').addEventListener('click', beginAsk);

function beginAsk() {
  showScreen('ask');
  brain = makeBrain(el('obCanvas'), el('brainBox'));
  window.__obBrain = brain;        // debug handle, mirrors the workspace's window.__brain
  brain.seedHub('Your company');   // self-retries via rAF until the box is sized
  askStep();                       // flow does NOT wait on rAF
}

const thread = el('thread'), threadScroll = el('obThread'), brainSub = el('brainSub'),
  ledger = el('ledger'), progressBar = el('progressBar'),
  composerEl = el('obComposer'), field = el('composerInput'), sendBtn = el('sendBtn'),
  composerHint = el('composerHint'), attachBtn = el('attachBtn'), voiceBtn = el('voiceBtn'),
  fileInput = el('fileInput'), attachRow = el('attachRow');
pressable(sendBtn, 0.9);

let lastSpeaker = null;      // spaces messages when the speaker changes
let pendingChips = null;     // the live one-shot chip row, if any
let awaitingAnswer = false;  // false while Allya is "thinking"
let mode = 'text';           // 'text' | 'choice' — what the current step accepts
let pendingFiles = [];       // attachments staged for the next answer
const attachments = {};      // { [stepKey]: [filename, …] } — never mixed into answers

/* ---- transcript primitives (the workspace's, ported) ---- */
function scrollThread() {
  // near-bottom only, so reading back through earlier answers isn't yanked
  // away when the next question lands. setTimeout, not rAF — a throttled
  // tab must never strand the flow.
  const near = threadScroll.scrollHeight - threadScroll.scrollTop - threadScroll.clientHeight < 80;
  if (!near) return;
  setTimeout(() => {
    threadScroll.scrollTo({ top: threadScroll.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, 0);
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
    const dy = 10;
    bubble.style.opacity = 0; bubble.style.transform = `translateY(${dy}px)`;
    new Spring(0, { response: 0.4, damping: 0.85, onframe: (p, v, settled) => {
      bubble.style.opacity = p; bubble.style.transform = `translateY(${dy * (1 - p)}px)`;
      if (settled) { bubble.style.transform = ''; bubble.style.opacity = ''; }
    }}).to(1);
  }
  scrollThread();
  return row;
}

function obTyping(then, delay = 900) {
  const row = document.createElement('div');
  row.className = 'msg change';
  row.innerHTML = '<div class="msg-block"><div class="bubble allya typing" aria-label="Allya is thinking"><i></i><i></i><i></i></div></div>';
  thread.appendChild(row); scrollThread();
  setTimeout(() => { row.remove(); then(); }, reduceMotion ? 200 : delay);
}

function obChips(list) {
  clearChips();
  const wrap = document.createElement('div'); wrap.className = 'chips';
  list.forEach(c => {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = c.label;
    pressable(b, 0.94);
    b.addEventListener('click', () => { clearChips(); c.act(); });   // one-shot
    wrap.appendChild(b);
  });
  thread.appendChild(wrap); scrollThread();
  pendingChips = wrap;
}
function clearChips() { if (pendingChips) { pendingChips.remove(); pendingChips = null; } }

/* ---- asking ---- */
function setProgress() {
  progressBar.style.width = `${((idx + 1) / (QUESTIONS.length + 1)) * 100}%`;
}

function askStep() {
  if (idx === -1) {
    brainSub.textContent = 'waiting for a name…';
    setProgress();
    addMsg('allya', escapeHtml("Hi — I'm Allya, and I'll be running the parts of your company you don't have time for. Before we begin: what's your company called?"), { tag: 'First things first' });
    setComposerMode({ type: 'short', placeholder: 'Your company name' });
    return;
  }
  const step = QUESTIONS[idx];
  brainSub.textContent = 'building as you talk…';
  setProgress();
  addMsg('allya', escapeHtml(step.q), { tag: `<b>Q${idx + 1}</b> / 6 · ${step.tag}` });

  if (step.type === 'choice') {
    obChips(step.options.map(o => ({ label: o, act: () => submitAnswer(o) })));
  } else if (step.example) {
    obChips([{ label: 'Show me an example', act: () => {
      field.value = step.example; autoGrow(field, 132); field.focus();
    } }]);
  }
  setComposerMode(step);
}

function setComposerMode(step) {
  mode = step.type === 'choice' ? 'choice' : 'text';
  const choice = mode === 'choice';
  // readOnly rather than disabled: disabled blurs the field, which on mobile
  // dismisses the keyboard and re-pops it on the next step
  field.readOnly = choice;
  composerEl.classList.toggle('is-locked', choice);
  field.placeholder = choice ? 'Pick one above' : (step.placeholder || '');
  field.value = ''; autoGrow(field, 132);
  composerHint.innerHTML = choice
    ? 'Pick an option above'
    : '<kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line';
  awaitingAnswer = true;
  setTimeout(() => { if (!choice) field.focus(); }, reduceMotion ? 0 : 240);
}

function autoGrow(t, max = 260) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, max) + 'px'; }

/* ---- answering ---- */
function trySubmit() {
  if (!awaitingAnswer || mode !== 'text') return;
  const val = field.value.trim();
  if (!val) return;
  submitAnswer(val);
}
sendBtn.addEventListener('click', trySubmit);
field.addEventListener('input', () => autoGrow(field, 132));
field.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.shiftKey) return;                       // newline
  e.preventDefault();                           // Enter (and ⌘/Ctrl+Enter) send
  trySubmit();
});

function submitAnswer(val) {
  if (!awaitingAnswer) return;                  // no double-submit mid-thought
  awaitingAnswer = false;
  clearChips();

  const files = pendingFiles.slice();
  const fileLine = files.length
    ? `<span class="ob-sent-file"><svg viewBox="0 0 24 24" fill="none" width="12" height="12"><path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l9-9a3.5 3.5 0 014.9 4.9l-9 9a2 2 0 01-2.8-2.8l8.1-8.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> ${escapeHtml(files.map(f => f.name).join(', '))}</span>`
    : '';
  addMsg('you', escapeHtml(val).replace(/\n/g, '<br>') + fileLine);
  field.value = ''; autoGrow(field, 132);
  clearFiles();
  stopVoice();

  setTimeout(() => afterAnswer(val, files), 240);
}

function afterAnswer(val, files) {
  // name step
  if (idx === -1) {
    companyName = val; answers.company = val;
    if (files.length) attachments.company = files.map(f => f.name);
    brain.setHubLabel(val); brain.fireThought();
    idx = 0;
    const hello = ackFor({ ack: () => `Lovely — ${val} it is. Let me start its brain.` }, val, files);
    obTyping(() => {
      addMsg('allya', escapeHtml(hello));
      obTyping(() => askStep(), 760);
    }, 700);
    return;
  }

  const step = QUESTIONS[idx];
  answers[step.key] = val;
  if (files.length) attachments[step.key] = files.map(f => f.name);
  // grow the brain for this answer, update the live status, log it
  brainSub.textContent = step.sub;
  brain.grow(step.cluster(val));
  addLedger(step);

  const last = idx >= QUESTIONS.length - 1;
  const ack = ackFor(step, val, files);

  if (last) {
    obTyping(() => {
      addMsg('allya', escapeHtml(ack));
      setTimeout(runSynthesis, 720);
    }, 800);
    return;
  }
  idx++;
  obTyping(() => {
    addMsg('allya', escapeHtml(ack));
    obTyping(() => askStep(), 760);
  }, 700);
}

/* Allya reacts to what was actually said — never the same "Got it" six
   times over, which is what makes a scripted flow feel like a form. */
function ackFor(step, val, files) {
  let line = typeof step.ack === 'function' ? step.ack(val) : 'Noted.';
  if (files && files.length) {
    line += files.length === 1
      ? ` And thanks for ${files[0].name} — I'll read it.`
      : ` And thanks for those ${files.length} files — I'll read them.`;
  }
  return line;
}

/* ---- documents: staged as pills, recorded by filename only. Contents are
   deliberately not parsed — folding raw file text into the answer would
   pollute splitGoals/shortLabel/derive, which read answers[key] directly. */
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  Array.from(fileInput.files || []).forEach(f => {
    if (!pendingFiles.some(p => p.name === f.name && p.size === f.size)) {
      pendingFiles.push({ name: f.name, size: f.size });
    }
  });
  fileInput.value = '';       // so re-picking the same file fires change again
  renderFiles();
});

function renderFiles() {
  attachRow.innerHTML = '';
  attachRow.hidden = pendingFiles.length === 0;
  pendingFiles.forEach((f, i) => {
    const pill = document.createElement('span'); pill.className = 'ob-attach-pill';
    pill.innerHTML = `<span class="ap-name">${escapeHtml(f.name)}</span><span class="ap-size">${fileSize(f.size)}</span>`;
    const x = document.createElement('button');
    x.className = 'ap-x'; x.type = 'button'; x.innerHTML = '&times;';
    x.setAttribute('aria-label', `Remove ${f.name}`);
    x.addEventListener('click', () => { pendingFiles.splice(i, 1); renderFiles(); });
    pill.appendChild(x);
    attachRow.appendChild(pill);
  });
}
function clearFiles() { pendingFiles = []; renderFiles(); }
function fileSize(b) { return b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`; }

/* ---- voice: the browser's own SpeechRecognition, dictating into the
   field. It never auto-submits — you read it back and press Enter. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recording = false, baseText = '';

if (!SR) {
  voiceBtn.hidden = true;     // a dead control is worse than no control
} else {
  voiceBtn.addEventListener('click', () => recording ? stopVoice() : startVoice());
}

function startVoice() {
  if (!SR || recording || mode === 'choice') return;
  rec = new SR();
  rec.continuous = true; rec.interimResults = true;
  rec.lang = navigator.language || 'en-US';
  baseText = field.value ? field.value.replace(/\s*$/, ' ') : '';

  rec.onresult = (e) => {
    let text = '';
    for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
    field.value = baseText + text;
    autoGrow(field, 132);
    if (e.results[e.results.length - 1].isFinal) baseText = field.value.replace(/\s*$/, ' ');
  };
  rec.onerror = (e) => {
    stopVoice();
    const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
      ? 'Voice needs mic access — type instead'
      : 'Voice didn\'t catch that — type instead';
    flashHint(msg);
  };
  rec.onend = () => stopVoice();

  try { rec.start(); } catch { return; }
  recording = true;
  voiceBtn.classList.add('is-live');
  voiceBtn.title = 'Stop recording';
  flashHint('Listening — press the mic again to stop', 0);
}

function stopVoice() {
  if (rec) { rec.onend = null; try { rec.stop(); } catch {} rec = null; }
  if (!recording) return;
  recording = false;
  voiceBtn.classList.remove('is-live');
  voiceBtn.title = 'Answer with your voice';
  restoreHint();
  field.focus();
}

let hintTimer = 0;
function flashHint(msg, revertAfter = 3200) {
  clearTimeout(hintTimer);
  composerHint.textContent = msg;
  if (revertAfter) hintTimer = setTimeout(restoreHint, revertAfter);
}
function restoreHint() {
  clearTimeout(hintTimer);
  composerHint.innerHTML = mode === 'choice'
    ? 'Pick an option above'
    : '<kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line';
}

function addLedger(step) {
  const learned = ledgerLine(step);
  const item = document.createElement('div'); item.className = 'ob-ledger-item';
  item.innerHTML = `<span class="lg-tick"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.2l2.6 2.6L10 3" stroke="#91d45f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> ${learned}`;
  ledger.appendChild(item);
  while (ledger.children.length > 4) ledger.removeChild(ledger.firstChild);
  riseIn(item, 10);
}
function ledgerLine(step) {
  switch (step.key) {
    case 'business': return `Mapped your business — <b>5 areas</b> I can run`;
    case 'market': return `You sell to <b>${escapeHtml(answers.market)}</b>`;
    case 'customer': return `Learned your customer`;
    case 'revenue': return `Placed your stage — <b>${escapeHtml(revenueStage(answers.revenue).badge)}</b>`;
    case 'goals': return `Locked <b>${splitGoals(answers.goals).length} goals</b>`;
    case 'edge': return `Captured your edge`;
    default: return 'Noted';
  }
}

/* ============================================================
   Synthesis — the brief "cofounder waking up" moment, then showcase
   ============================================================ */
const SYNTH_STEPS = ['Waking up your cofounder…', 'Mapping your business', 'Profiling your customer', 'Analysing your revenue', 'Locking in your goals', 'Your AI cofounder is live ✦'];

function runSynthesis() {
  // hand the live brain over to the full-bleed synthesis stage
  const mount = el('synthBrainMount');
  mount.innerHTML = '';
  mount.appendChild(el('brainBox'));
  showScreen('synth');
  brain.setThoughts(true);
  requestAnimationFrame(() => { brain.start(); brain.bloom(); });

  const statusEl = el('synthStatus');
  let i = 0;
  const tick = () => {
    statusEl.textContent = SYNTH_STEPS[i];
    if (i > 0) brain.bloom();
    i++;
    if (i < SYNTH_STEPS.length) setTimeout(tick, i === 1 ? 620 : 520);
    else setTimeout(buildShowcase, 700);
  };
  tick();
}

/* ============================================================
   Deriving "what we can do" from the answers — deterministic, but
   it echoes the founder's own words so it reads as understanding.
   ============================================================ */
const STOP = new Set('the a an and or for to of in on with we our i you your is are be that this it they them their at by from as have has do does help make making build building using use used company business customer customers product products platform service services app tool tools people team small no not who what where when how one line month year 3 top objectives next 6 12'.split(/\s+/));

function words(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean); }
function titleCase(s) { return (s || '').replace(/\b\w/g, c => c.toUpperCase()); }
function shortLabel(s, n = 3) {
  const w = (s || '').trim().replace(/^[0-9]+[.)\-\s]+/, '').split(/\s+/).filter(Boolean);
  const out = w.slice(0, n).join(' ');
  return titleCase(out.length > 22 ? out.slice(0, 22) : out) || '—';
}
function splitLeaves(s, n) {
  const parts = (s || '').split(/[,/]| and | & /i).map(x => x.trim()).filter(Boolean);
  return (parts.length > 1 ? parts : [s]).slice(0, n).map(x => shortLabel(x, 2));
}
function splitGoals(s) {
  // prefer line/semicolon breaks; fall back to commas / "and"
  let parts = (s || '').split(/\n|;/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) parts = (s || '').split(/,|\band\b/i).map(x => x.trim()).filter(Boolean);
  return parts
    .map(x => x.replace(/^[0-9]+[.)\-]\s*/, '').trim())   // strip "1." / "2)" numbering
    .filter(x => x.length > 1)
    .slice(0, 3);
}

const CATEGORY = [
  { k: /market ?place/, cat: 'marketplace', word: 'Marketplace' },
  { k: /saas|software|dashboard|platform|api|b2b app/, cat: 'SaaS platform', word: 'Software' },
  { k: /fintech|payment|lending|bank|wallet|invoic|finance/, cat: 'fintech product', word: 'Fintech' },
  { k: /health|clinic|patient|care|wellness|therap/, cat: 'health product', word: 'Care' },
  { k: /edtech|education|course|learn|student|tutor/, cat: 'learning product', word: 'Learning' },
  { k: /agency|consult|studio|freelanc|done-for-you/, cat: 'services business', word: 'Craft' },
  { k: /d2c|dtc|ecommerce|e-commerce|store|shop|brand|retail|subscription box|apparel|coffee|food|beverage/, cat: 'consumer brand', word: 'Brand' },
  { k: /\bai\b|\bml\b|model|agent|automat/, cat: 'AI product', word: 'Intelligence' },
  { k: /content|media|newsletter|creator|publish/, cat: 'media product', word: 'Story' },
  { k: /community|network|social/, cat: 'community product', word: 'Community' },
  { k: /logistics|delivery|supply|warehouse|fleet/, cat: 'logistics business', word: 'Movement' },
];

function derive() {
  const biz = answers.business || '', edge = answers.edge || '', goals = answers.goals || '';
  const market = answers.market || 'Both';
  const b2b = market === 'Businesses', b2c = market === 'Consumers';
  const baseSeg = b2b ? 'B2B' : b2c ? 'B2C' : 'B2B + B2C';

  // category + one word
  const hay = (biz + ' ' + edge).toLowerCase();
  let cat = null;
  for (const c of CATEGORY) { if (c.k.test(hay)) { cat = c; break; } }
  const category = cat ? cat.cat : (b2c ? 'consumer business' : 'business');
  let oneWord = cat ? cat.word : '';
  if (!oneWord) {
    const freq = {}; words(biz).forEach(w => { if (w.length > 4 && !STOP.has(w)) freq[w] = (freq[w] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    oneWord = top ? titleCase(top[0]) : 'Momentum';
  }

  const customer = cleanCustomer(answers.customer);
  const rev = revenueStage(answers.revenue);
  const goalList = splitGoals(goals);
  const edgeClean = firstSentence(edge);

  // elevator pitch — always coherent, uses their words
  const artA = /^[aeiou]/i.test(category) ? 'an' : 'a';
  let pitch = `${companyName || 'Your company'} is ${artA} ${category} for ${customer.lower}.`;
  if (edgeClean) pitch += ` What sets it apart: ${lowerFirst(edgeClean)}.`;

  return { companyName: companyName || 'Your company', baseSeg, category, oneWord, customer, rev, goalList, edge: edgeClean, pitch,
    capabilities: pickCapabilities(goals + ' ' + biz + ' ' + edge, baseSeg) };
}

function cleanCustomer(s) {
  let t = (s || '').trim().replace(/^(our|my)\s+(ideal\s+)?customers?\s*(is|are|:)?\s*/i, '').replace(/\.$/, '');
  const lower = t ? t.charAt(0).toLowerCase() + t.slice(1) : 'founders like you';
  return { text: t || 'Founders like you', lower };
}
function firstSentence(s) { const m = (s || '').trim().split(/(?<=[.!?])\s/)[0]; return (m || '').replace(/\.$/, '').trim(); }
function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

function revenueStage(s) {
  const t = (s || '').toLowerCase();
  const scale = (suf) => /^(k|thousand)/.test(suf) ? 1e3 : /^(l|lakh|lac)/.test(suf) ? 1e5 : /^(m|mn|million)/.test(suf) ? 1e6 : /^(cr|crore)/.test(suf) ? 1e7 : 1;
  // 1) prefer a number attached to a scale suffix — takes the last one so
  //    ranges like "3-4L" resolve to the upper, scaled figure
  let monthly = null;
  const scaleRe = /([0-9][0-9,.]*)\s*(crore|cr|lakh|lac|million|mn|thousand|k|l|m)\b/g;
  let sm, last = null; while ((sm = scaleRe.exec(t))) last = sm;
  if (last) monthly = parseFloat(last[1].replace(/,/g, '')) * scale(last[2]);
  else {
    const cur = t.match(/[$₹]\s?([0-9][0-9,.]*)/);            // 2) a currency figure
    if (cur) monthly = parseFloat(cur[1].replace(/,/g, ''));
    else { const bare = t.match(/\b([0-9][0-9,.]*)\b(?!\s*%)/); if (bare) monthly = parseFloat(bare[1].replace(/,/g, '')); }  // 3) a bare number (not a percent)
  }
  const preWords = /\b(pre-?revenue|no revenue|not yet|none|nothing|zero|no sales|not making)\b/.test(t) || /[$₹]\s?0\b/.test(t);
  if (preWords || monthly === 0) return { badge: 'Pre-revenue', line: "You're pre-revenue — so first moves are about proof and pipeline." };
  if (monthly != null && monthly < 15000) return { badge: 'Early revenue', line: 'Early revenue — the focus is repeatable growth without adding headcount.' };
  if (monthly != null) return { badge: 'Generating revenue', line: 'Revenue is flowing — Allya protects your time so you can compound it.' };
  return { badge: 'Revenue underway', line: 'Revenue is flowing — Allya protects your time so you can compound it.' };
}

const CAP_LIB = [
  { dept: 'Marketing', origin: 'agent', title: 'Run your newsletter & campaigns', line: 'Drafted around your real wins, ready for your one-click approval.', m: /market|grow|brand|audience|launch|content|email|newsletter|awareness|reach/ },
  { dept: 'Marketing', origin: 'agent', title: 'Content calendar & SEO', line: 'A steady drumbeat of posts and pages that compound over time.', m: /content|seo|blog|social|traffic|inbound|awareness/ },
  { dept: 'Sales', origin: 'agent', title: 'Enrich & clean your CRM', line: 'Dedupe, enrich, and keep every lead current — automatically.', m: /sales|lead|crm|pipeline|revenue|convert|deal|customer|grow/ },
  { dept: 'Sales', origin: 'agent', title: 'Outbound to your ideal customer', line: 'Personalised sequences aimed at exactly the customer you described.', m: /sales|outbound|lead|pipeline|acquisition|convert|deal|grow|customer/ },
  { dept: 'Sales', origin: 'expert', title: 'Pipeline review with a sales expert', line: 'A real operator sanity-checks your funnel before you scale spend.', m: /sales|pipeline|revenue|scale|convert|deal/ },
  { dept: 'Hiring', origin: 'agent', title: 'Write JDs & screen candidates', line: 'Role scoped, sourced, and ranked against the JD you approve.', m: /hire|hiring|team|recruit|talent|ops lead|people|headcount|staff/ },
  { dept: 'Hiring', origin: 'expert', title: 'Shortlist review with a hiring expert', line: 'A specialist sits in on your top candidates and holds the slots.', m: /hire|hiring|recruit|team|talent|people/ },
  { dept: 'PR', origin: 'agent', title: 'Build a press list for your space', line: 'Journalists matched to your category, with angles that fit them.', m: /pr|press|media|coverage|launch|awareness|publicity|brand|journalist/ },
  { dept: 'PR', origin: 'expert', title: 'Pitch angles reviewed by a PR expert', line: 'A PR pro tightens the story before it ever reaches a reporter.', m: /pr|press|media|coverage|story|launch/ },
  { dept: 'Ops', origin: 'agent', title: 'Meeting notes & follow-ups', line: 'Every call captured, every action item chased down for you.', m: /ops|operation|process|admin|efficien|time|organi|workflow/ },
  { dept: 'Ops', origin: 'agent', title: 'SOPs & vendor tracking', line: 'Turn how you work into repeatable playbooks the team can run.', m: /ops|process|scale|sop|vendor|supply|logistics|efficien/ },
  { dept: 'Growth', origin: 'expert', title: 'Investor list & update drafts', line: 'A curated list and monthly updates, reviewed before they send.', m: /raise|invest|fund|seed|round|vc|capital|pitch deck/ },
];

function pickCapabilities(hay, baseSeg) {
  hay = hay.toLowerCase();
  const scored = CAP_LIB.map(c => ({ c, s: c.m.test(hay) ? 1 : 0 }));
  const chosen = []; const perDept = {};
  // matched first, capped 2 per dept
  scored.filter(x => x.s).forEach(({ c }) => { perDept[c.dept] = (perDept[c.dept] || 0); if (perDept[c.dept] < 2) { chosen.push(c); perDept[c.dept]++; } });
  // ensure spread + minimum, fill with unmatched from new depts
  for (const c of CAP_LIB) { if (chosen.length >= 6) break; if (chosen.includes(c)) continue; if ((perDept[c.dept] || 0) >= 2) continue; chosen.push(c); perDept[c.dept] = (perDept[c.dept] || 0) + 1; }
  // guarantee at least one expert card (the honest 15%)
  if (!chosen.some(c => c.origin === 'expert')) { const e = CAP_LIB.find(c => c.origin === 'expert' && !chosen.includes(c)); if (e) chosen[chosen.length - 1] = e; }
  return chosen.slice(0, 6);
}

/* ============================================================
   Showcase render
   ============================================================ */
const ICON = {
  agent: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" rx="3" stroke="#91d45f" stroke-width="1.7"/><circle cx="9" cy="12" r="1.4" fill="#91d45f"/><circle cx="15" cy="12" r="1.4" fill="#91d45f"/><path d="M12 3v3" stroke="#91d45f" stroke-width="1.7" stroke-linecap="round"/></svg>',
  expert: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 12 11Zm-6 8.2a6 6 0 0 1 12 0" stroke="#e7c98a" stroke-width="1.7" stroke-linecap="round"/></svg>',
};

function buildShowcase() {
  const d = derive();
  saveHandoff(d);

  const caps = d.capabilities.map(c => `
    <div class="ob-cap ${c.origin === 'expert' ? 'exp' : ''}">
      <span class="ob-cap-ic">${c.origin === 'expert' ? ICON.expert : ICON.agent}</span>
      <div class="ob-cap-copy">
        <div class="ob-cap-title">${escapeHtml(c.title)}</div>
        <div class="ob-cap-line">${escapeHtml(c.line)}</div>
      </div>
      <span class="pill ${c.origin === 'expert' ? 'expert' : ''}">${c.origin === 'expert' ? 'expert' : 'agent'}</span>
    </div>`).join('');

  const goals = d.goalList.length
    ? `<ul class="ob-goals-list">${d.goalList.map((g, i) => `<li><span class="gn">${i + 1}</span>${escapeHtml(g)}</li>`).join('')}</ul>`
    : `<div class="ob-fact-val">Ready when you are.</div>`;

  el('showInner').innerHTML = `
    <div class="ob-show-eyebrow"><span class="ob-eyebrow-dot"></span> Your cofounder is live</div>
    <h1 class="ob-show-lead">${escapeHtml(d.companyName)}, as I understand it.</h1>
    <p class="ob-show-sub">Here's what I took from our conversation — and the work I can start taking off your plate today.</p>

    <div class="ob-essence">
      <div class="ob-card ob-oneword-card">
        <div class="ob-kicker">In one word</div>
        <div class="ob-oneword">${escapeHtml(d.oneWord)}</div>
        <div class="ob-oneword-note">The through-line I'll keep in mind on everything I do for you.</div>
      </div>
      <div class="ob-card ob-pitch">
        <div class="ob-kicker">Your elevator pitch</div>
        <p>${escapeHtml(d.pitch)}</p>
      </div>
    </div>

    <div class="ob-facts">
      <div class="ob-card ob-fact">
        <div class="ob-kicker">The base of the business</div>
        <div class="ob-fact-val"><span class="ob-seg">${escapeHtml(d.baseSeg)}</span><br>${escapeHtml(titleCase(d.category))}</div>
      </div>
      <div class="ob-card ob-fact">
        <div class="ob-kicker">Your ideal customer</div>
        <div class="ob-fact-val">${escapeHtml(d.customer.text)}</div>
      </div>
      <div class="ob-card ob-fact">
        <div class="ob-kicker">Where you are</div>
        <div class="ob-fact-val"><span class="ob-seg">${escapeHtml(d.rev.badge)}</span><br>${escapeHtml(d.rev.line)}</div>
      </div>
    </div>

    <div class="ob-facts" style="grid-template-columns: 1fr;">
      <div class="ob-card ob-fact">
        <div class="ob-kicker">What you're driving at</div>
        ${goals}
      </div>
    </div>

    <div class="ob-can">
      <div class="ob-can-head">
        <h3>What I can do for you</h3>
        <span class="ob-split"><b>85%</b> agents · <b>15%</b> real experts · nothing ships without you</span>
      </div>
      <div class="ob-can-grid">${caps}</div>
    </div>

    <div class="ob-launch">
      <div class="ob-launch-copy">
        <div class="t">Your workspace is ready.</div>
        <div class="s">Walk in and I'll already be working — agents running, one thing waiting on your eyes.</div>
      </div>
      <button class="cta ob-enter" id="enterBtn">Enter your workspace
        <svg viewBox="0 0 24 24" fill="none" width="17" height="17"><path d="M4 12h15M13 6l6 6-6 6" stroke="#0a0a0a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;

  showScreen('show');
  el('screenShow').scrollTop = 0;
  const enter = el('enterBtn'); pressable(enter, 0.97);
  enter.addEventListener('click', () => { window.location.href = './index.html'; });

  if (!reduceMotion) {
    const cards = el('showInner').querySelectorAll('.ob-card, .ob-cap, .ob-launch');
    cards.forEach((c, i) => riseIn(c, 18, 60 + i * 55));
    riseIn(el('showInner').querySelector('.ob-show-lead'), 14, 20);
  }
}

/* ---- persist for the workspace to pick up ---- */
function saveHandoff(d) {
  try {
    localStorage.setItem('allya.onboarding', JSON.stringify({
      company: d.companyName, base: d.baseSeg, category: d.category, oneWord: d.oneWord,
      customer: d.customer.text, revenueBadge: d.rev.badge, goals: d.goalList,
      pitch: d.pitch, edge: d.edge, answers, attachments, at: Date.now(),
    }));
  } catch (e) { /* private mode — non-fatal */ }
}

/* boot */
showScreen('intro');
