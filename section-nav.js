// section-nav.js — horizontal secondary navigation bar.
//
// The top navbar is the site's master navigation and stays constant on every
// page. Each section's secondary navigation is its docked sidebar. This
// component mirrors the current section's TOP-LEVEL sidebar entries into a
// horizontal bar pinned directly under the navbar, so the secondary
// navigation is visible and constant across every page of the section —
// including the section landing page, which otherwise has no sidebar.
//
// The bar is derived from the rendered sidebar, so the sidebar's `contents`
// in `_quarto.yml` remain the single source of truth. Pages without a sidebar
// (Home, Blog, About) get no bar.

(() => {
  const header = document.getElementById('quarto-header');
  const sidebar = document.getElementById('quarto-sidebar');
  if (!header || !sidebar) return;

  const rootList = sidebar.querySelector('.sidebar-menu-container > ul');
  if (!rootList) return;

  const items = [];
  for (const li of rootList.children) {
    if (!li.classList || !li.classList.contains('sidebar-item')) continue;
    const link = li.querySelector('a.sidebar-link');
    const label = link && link.querySelector('.menu-text');
    const text = (label ? label.textContent : link ? link.textContent : '').trim();
    if (!text) continue;
    items.push({
      text: text,
      href: link ? link.getAttribute('href') : null,
      active: !!li.querySelector('a.active'),
    });
  }
  if (items.length < 2) return;

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

  // Report the bar's height so sticky siblings (TOC, knowledge-gap panes)
  // can offset themselves below the taller fixed header. Re-measured on
  // resize because wrapping changes the height.
  const setHeight = () => {
    document.documentElement.style.setProperty(
      '--section-nav-h',
      nav.offsetHeight + 'px'
    );
  };
  setHeight();
  window.addEventListener('resize', setHeight);
})();
