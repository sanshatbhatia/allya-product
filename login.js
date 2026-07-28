/* ============================================================
   Login — the brain behind the gate, and the form in front of it.

   The workspace brain in app.js is wired to the workspace DOM (the
   work list, the ledger, the dot pages) and can't be lifted out of
   it. This is the same graph drawn compactly and with none of that:
   a hub, five departments, their topics. It drifts, fires a thought
   along its edges now and then, and lights up under the pointer.
   Purely ambient — the gate sits in a dark well punched through the
   middle of it.
   ============================================================ */
(function brain() {
  const canvas = document.getElementById('brain');
  const ctx = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const GROUPS = {
    core: '#91d45f', product: '#91d45f', market: '#6f9fd8',
    traction: '#5fbfa8', model: '#d9a441', team: '#a78bda',
  };
  /* the company as an outsider meets it — not the workspace's departments */
  const SPEC = [
    { id: 'co', label: 'ZeroTo10', tier: 0, group: 'core' },
    { id: 'product', label: 'Product', tier: 1, group: 'product', parent: 'co' },
    { id: 'p1', label: 'Allya', tier: 2, group: 'product', parent: 'product' },
    { id: 'p2', label: 'Agents', tier: 2, group: 'product', parent: 'product' },
    { id: 'p3', label: 'Experts', tier: 2, group: 'product', parent: 'product' },
    { id: 'p4', label: 'Onboarding', tier: 2, group: 'product', parent: 'product' },
    { id: 'market', label: 'Market', tier: 1, group: 'market', parent: 'co' },
    { id: 'm1', label: 'Who it is for', tier: 2, group: 'market', parent: 'market' },
    { id: 'm2', label: 'Market size', tier: 2, group: 'market', parent: 'market' },
    { id: 'm3', label: 'Competition', tier: 2, group: 'market', parent: 'market' },
    { id: 'traction', label: 'Traction', tier: 1, group: 'traction', parent: 'co' },
    { id: 't1', label: 'Stage', tier: 2, group: 'traction', parent: 'traction' },
    { id: 't2', label: 'Proof', tier: 2, group: 'traction', parent: 'traction' },
    { id: 't3', label: 'Roadmap', tier: 2, group: 'traction', parent: 'traction' },
    { id: 'model', label: 'Model', tier: 1, group: 'model', parent: 'co' },
    { id: 'o1', label: 'Pricing', tier: 2, group: 'model', parent: 'model' },
    { id: 'o2', label: 'Unit economics', tier: 2, group: 'model', parent: 'model' },
    { id: 'o3', label: 'Go-to-market', tier: 2, group: 'model', parent: 'model' },
    { id: 'team', label: 'Team', tier: 1, group: 'team', parent: 'co' },
    { id: 'e1', label: 'Founders', tier: 2, group: 'team', parent: 'team' },
    { id: 'e2', label: 'Origin', tier: 2, group: 'team', parent: 'team' },
  ];
  /* three strands that skip the hub — the graph reads as a business, not a
     filing cabinet: what you sell prices itself, what you've proven is what
     the market rewarded, and the model is what the traction pays for */
  const CROSS = [['product', 'model'], ['market', 'traction'], ['model', 'traction']];

  let W = 0, H = 0, S = 1, dpr = 1;
  const nodes = [], byId = {}, edges = [];
  SPEC.forEach(s => {
    const n = { ...s, x: 0, y: 0, hx: 0, hy: 0, vx: 0, vy: 0, ex: 0, phase: Math.random() * TAU };
    nodes.push(n); byId[n.id] = n;
    if (s.parent) edges.push([s.parent, s.id]);
  });
  CROSS.forEach(([a, b]) => edges.push([a, b]));

  const R = { 0: 7, 1: 4.6, 2: 3 };
  const nodeR = n => R[n.tier] * S * (1 + n.ex * 0.5);

  function resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return false;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = w; H = h; S = clamp(Math.min(W, H) / 300, 0.9, 1.9);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
    return true;
  }

  /* the hub sits centre; departments ring it wide enough that the gate's
     dark well falls between the hub and the leaves */
  function layout() {
    const cx = W / 2, cy = H / 2;
    const rx1 = W * 0.30, ry1 = H * 0.26, rx2 = W * 0.16, ry2 = H * 0.17;
    byId.co.hx = cx; byId.co.hy = cy;
    const t1 = nodes.filter(n => n.tier === 1);
    t1.forEach((d, i) => {
      const a = (-Math.PI / 2) + (i / t1.length) * TAU;
      d.hx = cx + Math.cos(a) * rx1; d.hy = cy + Math.sin(a) * ry1; d._a = a;
    });
    t1.forEach(d => {
      const leaves = nodes.filter(n => n.parent === d.id);
      const gap = leaves.length > 3 ? 0.42 : 0.62;
      leaves.forEach((l, j) => {
        const a = d._a + (j - (leaves.length - 1) / 2) * gap;
        l.hx = d.hx + Math.cos(a) * rx2; l.hy = d.hy + Math.sin(a) * ry2;
      });
    });
    if (!nodes[0].x) nodes.forEach(n => { n.x = n.hx; n.y = n.hy; });
  }

  let pulses = [], clock = 0;
  const excite = (n, a) => { n.ex = clamp(n.ex + a, 0, 1.4); };
  function fireThought(target) {
    const leaves = nodes.filter(n => n.tier === 2);
    const t = target || leaves[(Math.random() * leaves.length) | 0];
    const path = []; let c = t;
    while (c) { path.push(c); c = c.parent ? byId[c.parent] : null; }
    path.reverse();
    for (let i = 0; i < path.length - 1; i++) {
      pulses.push({ a: path[i], b: path[i + 1], delay: i * 0.15, t: 0, dur: 0.55 + Math.random() * 0.25 });
    }
  }

  function sim(dt) {
    const time = performance.now() / 1000;
    for (const n of nodes) {
      const amp = n.tier === 0 ? 1.6 : 4.5;
      const tx = n.hx + Math.sin(time * 0.5 + n.phase) * amp;
      const ty = n.hy + Math.cos(time * 0.42 + n.phase) * amp;
      n.vx += (tx - n.x) * 32 * dt; n.vy += (ty - n.y) * 32 * dt;
    }
    for (const [aid, bid] of edges) {
      const a = byId[aid], b = byId[bid];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001;
      const rest = Math.hypot(b.hx - a.hx, b.hy - a.hy);
      const f = (d - rest) * 9, ux = dx / d, uy = dy / d;
      a.vx += ux * f * dt; a.vy += uy * f * dt;
      b.vx -= ux * f * dt; b.vy -= uy * f * dt;
    }
    const fr = Math.exp(-5.2 * dt);
    for (const n of nodes) { n.vx *= fr; n.vy *= fr; n.x += n.vx * dt; n.y += n.vy * dt; n.ex = Math.max(0, n.ex - dt * 1.1); }
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${clamp(a,0,1)})`;
  }
  function lighten(hex) {
    const h = hex.replace('#', ''); const m = c => Math.round(c + (255 - c) * 0.4);
    return `#${m(parseInt(h.slice(0,2),16)).toString(16).padStart(2,'0')}${m(parseInt(h.slice(2,4),16)).toString(16).padStart(2,'0')}${m(parseInt(h.slice(4,6),16)).toString(16).padStart(2,'0')}`;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const [aid, bid] of edges) {
      const a = byId[aid], b = byId[bid], lit = Math.max(a.ex, b.ex);
      ctx.strokeStyle = lit > 0.03
        ? hexA(GROUPS[a.group], 0.06 + lit * 0.22)
        : hexA(GROUPS[a.group], 0.06);
      ctx.lineWidth = (0.8 + lit) * S;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const s of pulses) {
      if (s.delay > 0) continue;
      const t = clamp(s.t, 0, 1);
      const x = s.a.x + (s.b.x - s.a.x) * t, y = s.a.y + (s.b.y - s.a.y) * t;
      const fade = Math.sin(t * Math.PI);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 7 * S);
      g.addColorStop(0, hexA('#eafbdc', 0.9 * fade)); g.addColorStop(1, hexA('#91d45f', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 7 * S, 0, TAU); ctx.fill();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const n of nodes) {
      const col = GROUPS[n.group], hub = n.tier === 0;
      const r = nodeR(n);
      const glow = (hub ? 1 : 0) + n.ex;
      if (hub || glow > 0.03) {
        const hr = r + (hub ? 22 : 10) * S + n.ex * 12 * S;
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, hr);
        g.addColorStop(0, hexA(col, 0.05 + glow * 0.15)); g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, hr, 0, TAU); ctx.fill();
      }
      const base = hub ? 0.95 : n.tier === 1 ? 0.7 : 0.46;
      ctx.fillStyle = n.ex > 0.02
        ? hexA(lighten(col), clamp(base + n.ex * 0.5, 0, 1))
        : hexA(col, base);
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();

      const lA = clamp(((hub ? 0.9 : n.tier === 1 ? 0.6 : 0.42) + n.ex * 0.7), 0, 1);
      ctx.font = `${hub ? 600 : 500} ${(hub ? 13 : n.tier === 1 ? 11.5 : 10) * clamp(S, 0.9, 1.25)}px "Inter Tight", system-ui, sans-serif`;
      ctx.fillStyle = hexA(n.tier === 2 ? '#c7ccd4' : '#f3f4f6', lA);
      ctx.fillText(n.label, n.x, n.y + r + 3 * S);
    }
  }

  // hover lights a node up — the graph stays touchable around the gate
  addEventListener('pointermove', e => {
    let best = null, bd = 1e9;
    for (const n of nodes) {
      const d = Math.hypot(e.clientX - n.x, e.clientY - n.y);
      if (d < nodeR(n) + 16 && d < bd) { best = n; bd = d; }
    }
    if (best && best.ex < 0.3) { excite(best, 0.7); if (best.parent) fireThought(best); }
  }, { passive: true });

  let raf = 0, last = 0, probeAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    // a size probe twice a second — a resize that lands before this script
    // runs (or an orientation change) never reaches the listener below
    if (now >= probeAt) {
      probeAt = now + 500;
      if (W !== innerWidth || H !== innerHeight) resize();
    }
    if (now - last < 33) return;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.08) dt = 0.08;
    sim(dt);
    clock += dt;
    if (clock > 2.8) { clock = 0; fireThought(); }
    for (const s of pulses) { if (s.delay > 0) s.delay -= dt; else s.t += dt / s.dur; }
    pulses = pulses.filter(s => s.t < 1);
    draw();
  }
  function start() {
    if (!resize()) { requestAnimationFrame(start); return; }
    if (reduceMotion) { draw(); return; }
    last = performance.now(); raf = requestAnimationFrame(frame);
  }
  addEventListener('resize', () => { if (resize() && reduceMotion) draw(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf && !reduceMotion) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  start();
  // dev handle, mirroring app.js's window.__brain — a hidden tab throttles
  // rAF to zero, so timed motion can only be inspected by stepping it
  window.__loginBrain = {
    fireThought, resize, draw,
    get nodeCount() { return nodes.length; },
    tickOnce(frames = 60, dt = 1 / 30) { for (let i = 0; i < frames; i++) sim(dt); draw(); },
  };
})();

/* ============================================================
   The form.

   INTEGRATION POINT: this prototype has no backend — app.js scripts
   its conversations too. `signIn` below runs the real pending and
   error states and then hands over the workspace. Replace its body
   with the actual sign-in call and leave the state handling as-is;
   the design already accounts for both outcomes.
   ============================================================ */
(function form() {
  const f = document.getElementById('loginForm');
  const btn = document.getElementById('submitBtn');
  const note = document.getElementById('note');
  const email = document.getElementById('email');
  const password = document.getElementById('password');

  function setBusy(on, msg) {
    btn.disabled = on;
    email.disabled = on; password.disabled = on;
    note.innerHTML = on ? `<span class="spinner"></span>${msg || 'Signing you in…'}` : '';
  }
  function setError(msg) {
    note.innerHTML = `<span class="is-error">${msg}</span>`;
  }

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    if (!email.value.trim() || !password.value) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    signIn(email.value.trim(), password.value);
  });

  function signIn() {
    // ---- replace with the real sign-in call ----
    setTimeout(() => { location.href = 'index.html'; }, 900);
  }
})();
