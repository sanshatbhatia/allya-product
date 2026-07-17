# Allya — product UI prototype

The interface founders use to work with **Allya** (by Zeroto10) — an AI execution partner: agents do the work, real experts approve it, nothing ships without you.

**v2 — dark workspace.** Conversation with Allya on the left; a live work panel on the right (Needs you / Running / Shipped today, with agent-vs-expert origin pills — the honest 85/15 seam). Palette from zeroto10.xyz (`#0a0a0a` + lime `#91d45f`). Allya and the human experts speak in Fraunces serif; the interface speaks in Inter Tight — typography tells you who's talking.

Motion follows Apple's *Designing Fluid Interfaces*: a hand-rolled spring engine (damping/response), 1:1 drag with velocity handoff, momentum projection, rubber-banding, fully interruptible. Approval surface is a right-side peek panel on desktop and a bottom sheet on mobile — same gesture code, axis-aware.

## Run

Zero dependencies, zero build:

```
node server.mjs
```

→ http://localhost:4321

Try: click **Review →** in the work panel, drag the panel by its grabber (flick to dismiss), approve and watch the item move to Shipped. `⌘K` or `/` focuses the composer; type "newsletter" or "hiring".

## Files

- `index.html` — workspace skeleton (topbar, chat pane, work panel, approval sheet)
- `styles.css` — design tokens + layout (dark palette, reduced-motion/transparency/contrast fallbacks)
- `app.js` — Spring engine, scripted conversation flows, data-driven work panel
- `server.mjs` — tiny static server

Prototype only — no backend; conversations are scripted beats.
