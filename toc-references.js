// toc-references.js — add a "References" entry to the page TOC ("On this page")
// when the page renders a references / bibliography section.
//
// Quarto renders the bibliography inside #quarto-appendix but does NOT add its
// heading to the auto-generated TOC. This component appends a matching entry so
// the page-internal navbar offers the same jump as any other section.
//
// Content-independent: it activates only on pages that actually have a
// references section (blog posts and document chapters with citations alike),
// and stays inert elsewhere. The injected entry uses Quarto's own TOC link
// markup (nav-link + data-scroll-target), so it anchors correctly. Quarto's
// scrollspy captures its nav-links at init, so this entry navigates on click
// rather than tracking highlight on scroll — acceptable for a terminal section.

(() => {
  const toc = document.getElementById('TOC');
  if (!toc) return;

  const bib = document.getElementById('quarto-bibliography');
  if (!bib) return;

  const heading = bib.querySelector('h1, h2, h3, h4, h5, h6');
  if (!heading) return;

  // Give the heading a stable id so the TOC anchor can target it.
  heading.id = heading.id || 'references';

  const list = toc.querySelector('ul');
  if (!list) return;

  // Guard against double injection.
  if (list.querySelector('[data-scroll-target="#' + heading.id + '"]')) return;

  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = '#' + heading.id;
  a.id = 'toc-' + heading.id;
  a.className = 'nav-link';
  a.setAttribute('data-scroll-target', '#' + heading.id);
  a.textContent = heading.textContent.trim() || 'References';
  li.appendChild(a);
  list.appendChild(li);
})();
