/**
 * modules/scroll-narrative.js
 * Task 5 — Scroll Narrative Orchestration
 *
 * Responsibilities:
 *   1. Central IntersectionObserver registry — each section announces itself.
 *      D3-heavy sections stay inert until in-view.
 *   2. Side-dot navigation (5 dots: Hero, Tiers, Value, Churn, Causal, Outcomes)
 *   3. Section-level entrance animations (section-enter class → is-visible)
 *   4. Cinematic full-bleed section dividers inserted between sections
 *   5. Global PS5 aesthetic patch (type hierarchy, glow tokens)
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION MANIFEST
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'hero',               label: 'Overview',       dotColor: '#00AAFF' },
  { id: 'tiers',              label: 'Tier Selection',  dotColor: '#00B8D4' },
  { id: 'sku-flow',           label: 'SKU Flow',        dotColor: '#00AAFF' },
  { id: 'perceived-value',    label: 'Perceived Value', dotColor: '#00E5FF' },
  { id: 'churn-pipeline',     label: 'Churn Engine',    dotColor: '#FF716C' },
  { id: 'causal-intervention',label: 'Causal Lab',      dotColor: '#A855F7' },
  { id: 'user-journey',       label: 'User Journey',    dotColor: '#00E5FF' },
  { id: 'section-outcomes',   label: 'Outcomes',        dotColor: '#F5A623' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. SIDE DOT NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

function buildDotNav() {
  const existing = document.querySelector('.dot-nav');
  if (existing) existing.remove();

  const nav = document.createElement('nav');
  nav.className = 'dot-nav';
  nav.setAttribute('aria-label', 'Section navigation');

  SECTIONS.forEach(sec => {
    const item = document.createElement('button');
    item.className = 'dot-nav__item';
    item.setAttribute('data-target', sec.id);
    item.setAttribute('data-label',  sec.label);
    item.setAttribute('aria-label',  `Navigate to ${sec.label}`);
    item.setAttribute('title',        sec.label);

    const dot = document.createElement('span');
    dot.className = 'dot-nav__dot';
    item.appendChild(dot);

    item.addEventListener('click', () => {
      const target = document.getElementById(sec.id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    nav.appendChild(item);
  });

  document.body.appendChild(nav);
  return nav;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CINEMATIC SECTION DIVIDERS
// ─────────────────────────────────────────────────────────────────────────────

const DIVIDER_PAIRS = [
  // [fromId, toColor1, toColor2]
  ['hero',               '#0070D1', '#00B8D4'],
  ['tiers',              '#00B8D4', '#00AAFF'],
  ['sku-flow',           '#00AAFF', '#00E5FF'],
  ['perceived-value',    '#00E5FF', '#7B2FBE'],
  ['churn-pipeline',     '#7B2FBE', '#A855F7'],
  ['causal-intervention','#A855F7', '#00E5FF'],
  ['user-journey',       '#00E5FF', '#F5A623'],
];

function insertDividers() {
  DIVIDER_PAIRS.forEach(([afterId, c1, c2]) => {
    const section = document.getElementById(afterId);
    if (!section) return;

    // Don't double-insert
    if (section.nextElementSibling?.classList.contains('section-divider')) return;

    const div = document.createElement('div');
    div.className = 'section-divider';
    div.setAttribute('aria-hidden', 'true');

    div.innerHTML = `
      <svg viewBox="0 0 1440 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="div-grad-${afterId}" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%"   stop-color="${c1}" stop-opacity="0.0"/>
            <stop offset="30%"  stop-color="${c1}" stop-opacity="0.25"/>
            <stop offset="70%"  stop-color="${c2}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${c2}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <!-- Waveform sweep -->
        <path d="M0,70 C360,20 720,120 1080,50 C1260,20 1380,80 1440,70 L1440,0 L0,0 Z"
              fill="rgba(9,14,23,0.98)" />
        <!-- Accent glow line -->
        <path d="M0,70 C360,20 720,120 1080,50 C1260,20 1380,80 1440,70"
              fill="none"
              stroke="url(#div-grad-${afterId})"
              stroke-width="1.5"
              opacity="0.7"/>
        <!-- Particle dots along the line — purely visual -->
        ${[0.15, 0.35, 0.55, 0.75, 0.88].map((t, i) => {
          const x = Math.round(t * 1440);
          // Bezier approximation for y
          const y = Math.round(70 + Math.sin(t * Math.PI * 2.5) * 30);
          return `<circle cx="${x}" cy="${y}" r="${1.5 + i * 0.3}"
                          fill="${i % 2 === 0 ? c1 : c2}"
                          opacity="0.5"/>`;
        }).join('')}
      </svg>`;

    section.after(div);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GLOBAL INTERSECTION OBSERVER — scroll entrance + dot-nav active state
// ─────────────────────────────────────────────────────────────────────────────

function initScrollNarrative() {
  const dotNavItems = document.querySelectorAll('.dot-nav__item');

  // Map section id → dot-nav item
  const dotMap = new Map();
  dotNavItems.forEach(item => dotMap.set(item.dataset.target, item));

  // Track which sections have already fired their entrance
  const enteredSections = new Set();

  // Per-section inner-element observers (lazy fire of transition-fade children)
  const childObservers = new Map();

  const sectionIO = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const id = entry.target.id;
      const dot = dotMap.get(id);

      if (entry.isIntersecting) {
        // ── Dot nav active state ─────────────────────────────────────────────
        dotNavItems.forEach(d => d.classList.remove('is-active'));
        dot?.classList.add('is-active');

        // ── Section entrance (exactly once) ──────────────────────────────────
        if (!enteredSections.has(id)) {
          enteredSections.add(id);

          // section-level fade
          if (entry.target.classList.contains('section-enter')) {
            entry.target.classList.add('is-visible');
          }

          // Stagger all un-activated transition-fade children
          const fadeEls = entry.target.querySelectorAll('.transition-fade:not(.is-visible)');
          fadeEls.forEach((el, i) => {
            const existingDelay = el.style.transitionDelay;
            const baseDelay = existingDelay
              ? parseInt(existingDelay, 10)
              : i * 80;
            setTimeout(() => el.classList.add('is-visible'), baseDelay);
          });
        }
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '-60px 0px 0px 0px',  // offset for fixed nav
  });

  // Observe all registered sections
  SECTIONS.forEach(sec => {
    const el = document.getElementById(sec.id);
    if (el) sectionIO.observe(el);
  });

  // ── Also update dot from scroll position ────────────────────────────────
  // (Handles fast-scroll cases where IO threshold may be missed)
  let rafPending = false;
  window.addEventListener('scroll', () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const midY = window.scrollY + window.innerHeight * 0.45;
      let closest = null;
      let closestDist = Infinity;

      SECTIONS.forEach(sec => {
        const el = document.getElementById(sec.id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const elMid = window.scrollY + rect.top + rect.height / 2;
        const dist  = Math.abs(elMid - midY);
        if (dist < closestDist) { closestDist = dist; closest = sec.id; }
      });

      if (closest) {
        dotNavItems.forEach(d => d.classList.toggle('is-active', d.dataset.target === closest));
      }
    });
  }, { passive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PS5 AESTHETIC GLOBAL PATCHES
// ─────────────────────────────────────────────────────────────────────────────

function applyAestheticPatches() {
  // Ensure the hero section has its elements pre-visible (they're above the fold)
  const heroFades = document.querySelectorAll('#hero .transition-fade');
  heroFades.forEach(el => el.classList.add('is-visible'));

  // Remove scroll-snap on the html element if shell sidebar is present
  // (snap conflicts with free-scroll inside the sidebar-offset layout)
  if (document.querySelector('.app-sidebar')) {
    document.documentElement.style.scrollSnapType = 'none';
  }

  // Apply section-enter class to all narrative sections that don't have it
  document.querySelectorAll('.narrative-section, .pv-section, .churn-section, .causal-section, .outcomes-section, .sku-flow-section').forEach(el => {
    if (!el.id || el.id === 'hero') return;
    if (!el.classList.contains('section-enter')) {
      el.classList.add('section-enter');
    }
  });

  // Patch: ensure scroll-margin-top accounts for 60px fixed nav
  document.querySelectorAll('[id]').forEach(el => {
    el.style.scrollMarginTop = '60px';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function initScrollNarrativeSystem() {
  // Wait for DOM to be fully populated (all sections rendered)
  const init = () => {
    buildDotNav();
    insertDividers();
    applyAestheticPatches();
    // Small delay to let layout settle before initialising observers
    requestAnimationFrame(() => {
      setTimeout(initScrollNarrative, 120);
    });
  };

  // All render*() calls are synchronous, so the DOM is fully populated
  // by the time initScrollNarrativeSystem() is called from main.js.
  // We still defer slightly via rAF to let the browser lay out sections.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    // 'interactive' or 'complete' — DOM is ready
    requestAnimationFrame(init);
  }
}
