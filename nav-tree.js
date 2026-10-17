// nav-tree.js — three-tier navigation chrome.
//
// Tier 1 is the navbar (constant on every page).
// Tier 2 is a horizontal bar directly under the navbar. It is built from the
//   current topic's TOP-LEVEL sidebar entries.
// Tier 3 is the docked sidebar itself, trimmed to the subtree of the active
//   tier-2 area.
//
// The sidebar defined in `_quarto.yml` is the single source of truth for tiers
// 2 and 3: this component reads the rendered sidebar, so the navigation is
// never declared twice. Pages without a sidebar (Home, Blog, About, Reference)
// get neither the bar nor trimming.

(() => {
  const header = document.getElementById('quarto-header');
  const sidebar = document.getElementById('quarto-sidebar');
  if (!header || !sidebar) return;

  const rootList = sidebar.querySelector('.sidebar-menu-container > ul');
  if (!rootList) return;

  const rootItems = Array.prototype.filter.call(rootList.children, (li) =>
    li.classList && li.classList.contains('sidebar-item')
  );
  if (!rootItems.length) return;

  const readItem = (li) => {
    const link = li.querySelector('a.sidebar-link');
    const label = link && link.querySelector('.menu-text');
    const text = (label ? label.textContent : link ? link.textContent : '').trim();
    return {
      text: text,
      href: link ? link.getAttribute('href') : null,
      active: !!li.querySelector('a.active'),
    };
  };

  // ---- Tier 2: the horizontal bar ----
  const items = rootItems.map(readItem).filter((item) => item.text);
  if (items.length >= 2) {
    const nav = document.createElement('nav');
    nav.className = 'section-nav';
    nav.setAttribute('aria-label', 'Section navigation');

    const list = document.createElement('ul');
    list.className = 'section-nav-list';

    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'section-nav-item';

      const el = document.createElement(item.href ? 'a' : 'span');
      el.className = 'section-nav-link' + (item.active ? ' active' : '');
      if (item.href) el.setAttribute('href', item.href);
      if (item.active) el.setAttribute('aria-current', 'page');
      el.textContent = item.text;

      li.appendChild(el);
      list.appendChild(li);
    }

    nav.appendChild(list);
    header.appendChild(nav);

    // Report the bar's height so sticky siblings (the right-hand TOC, the
    // knowledge-gap panes) clear the taller fixed header. Re-measure on resize
    // because wrapping changes the height.
    const setHeight = () => {
      document.documentElement.style.setProperty(
        '--section-nav-h',
        nav.offsetHeight + 'px'
      );
    };
    setHeight();
    window.addEventListener('resize', setHeight);
  }

  // ---- Tier 3: trim the panel to the active area's subtree ----
  const activeRoot = rootItems.find((li) => li.querySelector('a.active'));
  if (!activeRoot) return;                       // topic landing: keep the full tree
  const childList = activeRoot.querySelector(':scope > ul');
  if (!childList) return;                        // leaf area: keep the full tree

  for (const li of rootItems) {
    if (li !== activeRoot) li.style.display = 'none';
  }
})();
