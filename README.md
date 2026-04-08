# PS+ Subscriber Intelligence — Aetheris Console

> A Sony Interactive Entertainment analytics demo dashboard that visualises PlayStation Plus subscriber intelligence through a cinematic, scroll-driven data narrative.

![PS+ Analytics Dashboard](./public/preview.png)

---

## Table of Contents

- [Overview](#overview)
- [Live Demo](#live-demo)
- [Quick Start](#quick-start)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Section Map](#section-map)
- [Design System](#design-system)
- [Data Layer](#data-layer)
- [Cross-Viz Interactivity](#cross-viz-interactivity)
- [Scroll Narrative Architecture](#scroll-narrative-architecture)
- [Viewport Compatibility](#viewport-compatibility)
- [Development Notes](#development-notes)

---

## Overview

The **Aetheris Console** is a single-page, scroll-driven intelligence narrative built to answer one question:

> *Why do PS+ subscribers with the same SKU churn at wildly different rates?*

It chains **eight analytical layers** in a deliberate causal structure:

```
SKU Assignment
    ↓
Heterogeneous Perceived Value  (same SKU → different felt worth)
    ↓
Engagement Signals             (sessions/week, titles played, tenure)
    ↓
Continuous Churn Prediction    (ML inference pipeline, scored every session)
    ↓
Causal Intervention Design     (counterfactual A/B, population KDE, social network BFS)
    ↓
Outcome Measurement            (churn reduction %, precision lift, cost saved)
```

Each section fades and rises into view on scroll. D3 computations are deferred until the section enters the viewport so the page stays performant even with ~1,000 synthetic users being visualised simultaneously.

---

## Quick Start

### Prerequisites

| Tool | Min Version |
|---|---|
| Node.js | 18 |
| npm | 9 |

### Install & Run

```bash
# 1 — Clone the repo
git clone https://github.com/TGO74/sie-ps-demo.git
cd sie-ps-demo

# 2 — Install dependencies
npm install

# 3 — Start the dev server (hot-reload on port 5173)
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

### Production Build

```bash
# Bundle and minify to /dist
npm run build

# Preview the production bundle locally
npm run preview
```

The `dist/` directory is self-contained — serve it with any static HTTP server:

```bash
npx serve dist
# or
python -m http.server 8080 --directory dist
```

> **Note:** `dist/` is excluded from this repo via `.gitignore`. Run `npm run build` to generate it.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Bundler | [Vite](https://vitejs.dev/) v8 |
| Visualisation | [D3.js](https://d3js.org/) v7 |
| Styling | Vanilla CSS with custom design tokens |
| Fonts | [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) · [Manrope](https://fonts.google.com/specimen/Manrope) · [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) |
| Data | Deterministic synthetic JSON (no real subscriber data) |
| Hosting | Static — any CDN or server |

No framework, no build-time SSR, no TypeScript. The entire runtime is a single ES-module bundle output by Vite.

---

## Project Structure

```
sie-ps-demo/
│
├── data/
│   ├── tiers.json              # PS+ tier metadata (Essential / Extra / Premium)
│   └── users.json              # 1,000 deterministic synthetic subscribers
│
├── lib/
│   ├── data-gen.js             # Seeded PRNG (mulberry32) — reproducible user generator
│   ├── churn-score.js          # Pearson feature weights + scoreAtMonth(user, month)
│   ├── state.js                # Global reactive store — tier/segment/brush state
│   └── viz-state.js            # Pub/sub event bus for cross-viz highlight events
│
├── modules/
│   ├── app-shell.js            # Fixed top nav + sidebar, active-section IntersectionObserver
│   ├── tier-panels.js          # §1 — PS+ tier cards with gradient fills
│   ├── sku-flow.js             # §2 — SKU → Perceived Value → Churn causal flow diagram
│   ├── perceived-value.js      # §3 — Heatmap · KDE distributions · Linked scatter
│   ├── viz-heatmap.js          # Tier × Segment 9-cell heatmap renderer
│   ├── viz-distributions.js    # Kernel density curves with tier means
│   ├── viz-scatter.js          # Session depth vs value scatter + brush filter
│   ├── churn-pipeline.js       # §4 — Animated ML DAG · Feature bars · Timeline scrubber
│   ├── causal-intervention.js  # §5 — Counterfactual A/B · KDE morph · BFS network
│   ├── viz-user-journey.js     # §6 — 4-lane swimlane timeline, 10 personas
│   ├── outcomes.js             # §7 — Count-up metric cards · Framework summary
│   └── scroll-narrative.js     # Orchestrator — dot nav, cinematic dividers, global IO
│
├── styles/
│   ├── tokens.css              # Design tokens (color, typography, spacing, motion)
│   ├── layout.css              # Scroll shell, section base, transition classes
│   ├── shell.css               # App nav, sidebar, KPI bar, ripple summary box
│   ├── viz.css                 # D3 axis, grid, tooltip, brush styles
│   ├── sku-flow.css            # SKU flow diagram, particle animations, arc gauges
│   ├── churn.css               # Pipeline DAG, importance bars, lifecycle timeline
│   ├── causal.css              # Counterfactual curves, KDE shift, network graph
│   ├── journey.css             # Swimlane lanes, IV dots, CF toggle
│   ├── interactivity.css       # Playback controls, threshold slider, pill buttons
│   └── outcomes.css            # Outcome cards, dot nav, PS5 polish
│
├── index.html                  # Entry point — Google Fonts, viewport meta, #app mount
├── main.js                     # Bootstrap — renders all sections in dependency order
├── vite.config.js              # Vite config (no special config needed)
├── package.json
├── .gitignore
└── README.md                   # This file
```

---

## Section Map

| § | Section ID | Key Visualisation | Interaction |
|---|---|---|---|
| 1 | `tiers` | Staggered PS+ tier cards with gradient borders | Hover for price details |
| 2 | `sku-flow` | **SKU → Perceived Value → Churn** causal flow (Sankey-style animated particle arrows) | Click tier pills to filter; simulation mode month 0–12 |
| 3 | `perceived-value` | Heatmap (tier × segment) · KDE curves · Scatter plot | Brush scatter to cross-filter heatmap; segment dropdown |
| 4 | `churn-pipeline` | Animated ML inference DAG · Feature importance bars · Lifecycle timeline scrubber | Drag scrubber to scrub months 0–24; play/pause autoplay |
| 5 | `causal-intervention` | Counterfactual A/B curves · Population KDE shift · Social network BFS propagation | Select intervention type; click network nodes; risk threshold slider |
| 6 | `user-journey` | 4-lane swimlane timeline (engagement / perceived value / churn risk / interventions) across 18 months | 10-persona dropdown; counterfactual overlay toggle; click IV dots |
| 7 | `section-outcomes` | Three count-up metric cards (churn ↓ · precision ↑ · cost saved) | Auto-triggers on scroll entry |

---

## Design System

All design tokens live in `styles/tokens.css`. Key palette:

| Token | Value | Usage |
|---|---|---|
| `--bg-void` | `#040811` | Section backgrounds |
| `--bg-panel` | `rgba(13,22,38,0.9)` | Glassmorphism cards |
| `--ps-blue` | `#0070D1` | Essential tier accent |
| `--ps-teal` | `#00B8D4` | Primary action / flow |
| `--ps-teal-light` | `#00E5FF` | Laser-pointer highlights |
| `--ps-purple` | `#A855F7` | Premium tier accent |
| `--text-primary` | `#F0F4FF` | Headlines |
| `--text-muted` | `#3D5070` | Axis labels, hints |

**Typography:**
- **Display** — Plus Jakarta Sans (headings, card titles)
- **Body** — Manrope (subtitles, labels, filters)
- **Mono** — JetBrains Mono (data readouts, KPI values)

**Motion:**
- Entrance: `opacity 0 → 1` + `translateY(28px → 0)` on IntersectionObserver trigger
- D3 transitions: 350–600 ms ease, deferred until in-viewport
- Particle animations: CSS `offset-path` along SVG bezier curves

---

## Data Layer

### Tier Metadata (`data/tiers.json`)

Real PlayStation Plus tier pricing and feature lists:

```json
{
  "essential": { "monthly": 9.99, "annual": 79.99, "features": [...] },
  "extra":     { "monthly": 14.99, "annual": 134.99, "features": [...] },
  "premium":   { "monthly": 17.99, "annual": 159.99, "features": [...] }
}
```

### Synthetic Users (`data/users.json`)

1,000 users generated by `lib/data-gen.js` using a **seeded mulberry32 PRNG** — the same seed always produces the same dataset.

Each user object carries:

```js
{
  id: 0,
  tier: "essential" | "extra" | "premium",
  segment: "casual" | "mid-core" | "hardcore",
  sessionsPerWeek: 2.4,
  titlesPlayed: 3,
  monthsActive: 7,
  perceivedValue: 42,       // 0–100 composite score
  churnProbability: 0.31,   // baseline at month 0
  churned: false
}
```

### Churn Scoring (`lib/churn-score.js`)

The `scoreAtMonth(user, month)` function re-scores a user at any point in their subscription lifecycle, simulating engagement drift:

```js
import { scoreAtMonth } from './lib/churn-score.js';

const result = scoreAtMonth({ tier: 'essential', segment: 'casual', ... }, 6);
// → { churnProbability: 0.48, perceivedValue: 31 }
```

Feature weights (Pearson |r| with churn):

| Feature | Weight |
|---|---|
| Value Mismatch | 1.00 (100%) |
| Low Engagement | 0.81 |
| Catalog Disengagement | 0.73 |
| Tenure Shortfall | 0.42 |

---

## Cross-Viz Interactivity

All visualisations share state through two mechanisms:

### 1. Global Store (`lib/state.js`)

```js
import { store } from './lib/state.js';

// Write
store.set({ tier: 'essential', segment: 'casual' });

// Read
const { tier, segment, brushedUsers } = store.get();

// Subscribe
const unsub = store.subscribe(state => { /* react */ });
unsub(); // cleanup
```

### 2. Custom Events (`lib/viz-state.js`)

```js
// SKU Flow → other sections
document.dispatchEvent(new CustomEvent('sku:tierchange', { detail: { tier } }));

// User Journey hover → network node pulse
document.dispatchEvent(new CustomEvent('journey:highlight', { detail: { userId } }));
```

### Interaction Map

| Trigger | Effect |
|---|---|
| SKU pill click | Filters heatmap + churn gauges |
| Scatter brush | Highlights heatmap cells; readout updates |
| Heatmap cell click | Pre-fills scatter segment filter |
| Intervention selector | Updates counterfactual curves + KDE morph + network colours |
| Network node click | BFS propagation animates through social graph |
| Journey persona hover | Pulses matching node in network graph |

---

## Scroll Narrative Architecture

The scroll narrative is orchestrated by `modules/scroll-narrative.js`:

```
SECTIONS manifest → IntersectionObserver → classList.add('is-visible')
                                        → side-dot active state update
                                        → D3 chart initialise (first entry only)
```

**Adding a new section:**

1. Create your module in `modules/my-section.js` and export `renderMySection(appEl)`
2. Import and call it in `main.js` after the adjacent section
3. Add an entry to the `SECTIONS` array in `scroll-narrative.js`:
   ```js
   { id: 'my-section', label: 'My Section', icon: '◈' }
   ```
4. If you want a cinematic waveform divider above the section, add its pair to `DIVIDER_PAIRS` in the same file

---

## Viewport Compatibility

| Breakpoint | Layout |
|---|---|
| ≥ 1280 px | Full two-column card grids, expanded network graph |
| 900–1279 px | Single-column card stacks, sidebar collapses to icon-only |
| < 900 px | All grids single-column, scrubbers full-width |

CSS grid breakpoints are in `styles/layout.css`; component-level breakpoints are co-located in each component's CSS file.

---

## Development Notes

### Running the Dev Server

```bash
npm run dev
# → http://localhost:5173  (Vite HMR enabled)
```

Vite's HMR (Hot Module Replacement) works for CSS changes. JS module changes require a **full page reload** because the D3 charts maintain DOM state that HMR cannot cleanly patch.

### Adding Users / Changing the Dataset

Edit the seed or generation parameters in `lib/data-gen.js`, then regenerate:

```bash
node lib/data-gen.js > data/users.json
```

> The generator is a pure function — same seed → same 1,000 users every time.

### Linting / Formatting

No linter is configured by default. The codebase uses **2-space indentation**, **single quotes**, and **no trailing semicolons** omitted (standard D3 style).

### Environment

No environment variables are required. All data is bundled at build time via Vite's JSON import.

---

## Licence

Internal SIE demo — not for external distribution.

&copy; 2025 Sony Interactive Entertainment. All rights reserved.
