/**
 * modules/app-shell.js
 * Fixed Top Nav + Left Sidebar — matches Aetheris Console stitch design
 *
 * Navigation items reflect the four dashboard sections:
 *   SKU Selection → #tier-section
 *   Perceived Value → #perceived-value
 *   Churn Engine → #churn-pipeline
 *   Causal Lab → #causal-intervention
 */

const NAV_ITEMS = [
  {
    id:     'sku-selection',
    label:  'SKU Selection',
    target: '#tier-section',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
    </svg>`,
  },
  {
    id:     'perceived-value',
    label:  'Perceived Value',
    target: '#perceived-value',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <polyline points="1,12 5,6 9,9 15,2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id:     'churn-engine',
    label:  'Churn Engine',
    target: '#churn-pipeline',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/>
      <path d="M8 4v4l2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id:     'causal-lab',
    label:  'Causal Lab',
    target: '#causal-intervention',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 2v7.5a4 4 0 0 0 8 0V2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="2" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  },
];

// ── Build Top Nav ──────────────────────────────────────────────────────────────
function buildNav() {
  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Primary navigation');

  nav.innerHTML = `
    <div style="display:flex; align-items:center; flex:1; gap:var(--sp-6);">
      <a class="app-nav__brand" href="#" aria-label="PS+ Analytics home">
        PS+ Analytics
      </a>
      <div class="app-nav__links">
        <a class="app-nav__link is-active" href="#" data-nav-link="overview">Executive Overview</a>
        <a class="app-nav__link" href="#" data-nav-link="telemetry">Telemetry Stream</a>
        <a class="app-nav__link" href="#" data-nav-link="intelligence">System Intelligence</a>
      </div>
    </div>

    <div class="app-nav__search">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" stroke-width="1.4"/>
        <line x1="8.8" y1="8.8" x2="12" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <input type="text" placeholder="Search parameters…" aria-label="Search parameters"/>
    </div>

    <div class="app-nav__actions">
      <button class="app-nav__icon-btn" aria-label="Notifications" title="Notifications">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1.5a5.5 5.5 0 0 1 5.5 5.5v3l1.5 2H2L3.5 10V7A5.5 5.5 0 0 1 9 1.5ZM7 15h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <button class="app-nav__icon-btn" aria-label="Settings" title="Settings">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.2 3.2l1.4 1.4M13.4 13.4l1.4 1.4M3.2 14.8l1.4-1.4M13.4 4.6l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <div class="app-nav__avatar" aria-label="User profile" title="User profile">A</div>
    </div>`;

  return nav;
}

// ── Build Sidebar ──────────────────────────────────────────────────────────────
function buildSidebar() {
  const aside = document.createElement('aside');
  aside.className = 'app-sidebar';
  aside.setAttribute('role', 'complementary');
  aside.setAttribute('aria-label', 'Section navigation');

  const systemLabel = `
    <div class="sidebar-system-label">
      <div class="sidebar-system-label__title">● System Intelligence</div>
      <div class="sidebar-system-label__status">Vitals: Optimal</div>
    </div>`;

  const items = NAV_ITEMS.map((item, i) => `
    <a class="sidebar-nav__item${i === 0 ? ' is-active' : ''}"
       href="${item.target}"
       data-sidebar-target="${item.target}"
       id="sidebar-${item.id}"
       aria-current="${i === 0 ? 'page' : 'false'}">
      <span class="sidebar-nav__icon">${item.icon}</span>
      ${item.label}
    </a>`).join('');

  aside.innerHTML = `
    ${systemLabel}
    <nav class="sidebar-nav" aria-label="Section list">
      ${items}
    </nav>`;

  return aside;
}

// ── Active state tracking via IntersectionObserver ──────────────────────────
function initSidebarTracking() {
  const sidebarItems = document.querySelectorAll('.sidebar-nav__item');

  const sectionToItem = new Map();
  sidebarItems.forEach(item => {
    const target = item.dataset.sidebarTarget;
    if (target) sectionToItem.set(target.slice(1), item);
  });

  // Smooth scroll on click
  sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.dataset.sidebarTarget;
      const section = document.querySelector(target);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // IntersectionObserver: update active state on scroll
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const navItem = sectionToItem.get(entry.target.id);
      if (!navItem) return;

      if (entry.isIntersecting) {
        // Deactivate all
        sidebarItems.forEach(i => {
          i.classList.remove('is-active');
          i.setAttribute('aria-current', 'false');
        });
        // Activate matched
        navItem.classList.add('is-active');
        navItem.setAttribute('aria-current', 'page');
      }
    });
  }, {
    threshold: 0.3,
    rootMargin: '-60px 0px 0px 0px',  // offset for fixed nav
  });

  // Observe all sections
  NAV_ITEMS.forEach(item => {
    const section = document.querySelector(item.target);
    if (section) io.observe(section);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
export function renderAppShell() {
  // Insert nav and sidebar before #app
  const app = document.getElementById('app');

  const nav   = buildNav();
  const aside = buildSidebar();

  document.body.insertBefore(aside, app);
  document.body.insertBefore(nav,   aside);

  // Defer tracking until sections exist
  requestAnimationFrame(() => {
    setTimeout(initSidebarTracking, 300);
  });
}
