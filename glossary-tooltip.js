// glossary-tooltip.js — <glossary-tooltips> custom element
// Loads glossary JSON, wraps matching terms in the DOM, renders hover/tap tooltips.
// Usage: <glossary-tooltips></glossary-tooltips> anywhere in <body>

(() => {
  const GLOSSARY_FILE = 'glossary-en.json';

  const SCRIPT_EL = document.querySelector('script[src$="glossary-tooltip.js"]');
  const BASE_URL = SCRIPT_EL ? SCRIPT_EL.src : '/';
  let GLOSSARY_URL;
  try {
    GLOSSARY_URL = new URL(GLOSSARY_FILE, BASE_URL).href;
  } catch {
    // BASE_URL may be a bare path (e.g. '/' when no script element is present);
    // fall back to the relative filename.
    GLOSSARY_URL = GLOSSARY_FILE;
  }

  const CATEGORY_LABELS = {
    axiom: 'Axiom', principle: 'Principle', theorem: 'Theorem', definition: 'Definition',
    concept: 'Concept', driver: 'Change Driver', module: 'Module', coupling: 'Coupling',
    cohesion: 'Cohesion', knowledge: 'Knowledge', metric: 'Metric', pattern: 'Pattern',
    architecture: 'Architecture', paradigm: 'Paradigm', mechanism: 'Mechanism',
    organization: 'Organization', language: 'Language', type: 'Type', hypothesis: 'Hypothesis'
  };

  const ESCAPE_RE = /[&<>"]/g;
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s) => (s && typeof s === 'string') ? s.replace(ESCAPE_RE, c => ESCAPE_MAP[c]) : '';
  // Only allow http(s) and protocol-relative links; reject javascript:, data:, etc.
  const safeUrl = (s) => {
    if (typeof s !== 'string' || !s) return '';
    return /^https?:\/\//i.test(s) || /^\/\//i.test(s) ? s : '';
  };
  const NOPLACE_RE = /\u0000gt\d+\u0000/g;
  // Render a definition. If it contains an ordered list ("(n) item" lines), split
  // the intro paragraph from the list and emit a real <ol>; otherwise escape as plain text.
  const renderDef = (d) => {
    if (!d || typeof d !== 'string') return '';
    const lines = d.split('\n').map(s => s.trim());
    const itemIdx = lines.findIndex(l => /^\(\d+\)\s/.test(l));
    if (itemIdx === -1) return `<span class="gt-def">${esc(d)}</span>`;
    const intro = lines.slice(0, itemIdx).join(' ').trim();
    const items = lines.slice(itemIdx).filter(l => l);
    const lis = items.map(it => {
      const li = it.replace(/^\(\d+\)\s*/, '').trim();
      return `<li>${esc(li)}</li>`;
    }).join('');
    const introHtml = intro
      ? `<span class="gt-def">${esc(intro)}</span>`
      : '';
    return `${introHtml}<ol class="gt-def gt-ol">${lis}</ol>`;
  };

  function buildTooltip(key, entry, glossary) {
    let e = entry;
    const seenAliases = new Set();
    while (e?.alias && glossary[e.alias] && !seenAliases.has(e.alias)) {
      seenAliases.add(e.alias);
      key = e.alias;
      e = glossary[key];
    }

    const div = document.createElement('div');
    div.className = 'gt-pop';

    const lines = [];
    lines.push(`<span class="gt-cat">${esc(CATEGORY_LABELS[e.category] ?? e.category)}</span>`);
    lines.push(`<span class="gt-term">${esc(e.label ?? key)}</span>`);
    lines.push(renderDef(e.definition));

    if (e.also) lines.push(`<span class="gt-also">${esc(e.also)}</span>`);

    if (e.sources?.length) {
      const safeSources = e.sources.filter(s => s && typeof s === 'object');
      const links = safeSources.map(s => {
        const url = safeUrl(s.url);
        const label = esc(s.label);
        return url
          ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
          : `<span>${label}</span>`;
      });
      lines.push(`<span class="gt-sources">Info: ${links.join(' \u00b7 ')}</span>`);
    }

    div.innerHTML = lines.join('');
    return div;
  }

  function positionTooltip(tooltip, anchor) {
    const rect = anchor.getBoundingClientRect();
    const tipH = tooltip.offsetHeight;
    let tipW = tooltip.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const maxW = vw - 2 * margin;

    // Clamp width so a wide tooltip never hangs off-screen.
    if (tipW > maxW) {
      tipW = maxW;
      tooltip.style.maxWidth = maxW + 'px';
    }

    let top = rect.bottom + margin;
    let left = rect.left + rect.width / 2;

    if (top + tipH > vh - margin) top = rect.top - tipH - margin;
    if (top < margin) top = margin;
    left = Math.min(Math.max(left, margin + tipW / 2), vw - margin - tipW / 2);

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    tooltip.style.transform = 'translateX(-50%)';
  }

  let _activePop = null;
  let _activeAnchor = null;
  let _hideTimer = null;
  // Set while the pointer is down on the popup (e.g. dragging to select text).
  // While set, the hide timers are suppressed so a selection drag is never cut
  // short by a mouseout that briefly leaves the popup bounds.
  let _suppressHide = false;
  // Pops currently fading out. Each got its OWN removal timer, so a later hideAll
  // never cancels an already-scheduled removal — otherwise an earlier pop could
  // be orphaned in the DOM forever.
  const _fading = new Set();

  function _scheduleFade(pop) {
    if (_fading.has(pop)) return;
    _fading.add(pop);
    setTimeout(() => {
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
      _fading.delete(pop);
    }, 200);
  }

  function hideAll() {
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    _suppressHide = false;
    if (_activePop) {
      _activePop.classList.remove('gt-show');
      _scheduleFade(_activePop);
      _activePop.removeEventListener('mouseover', handlePopInteraction);
      _activePop.removeEventListener('mouseenter', handlePopInteraction);
      _activePop.removeEventListener('mousedown', handlePopInteraction);
      _activePop = null;
    }
    if (_activeAnchor) {
      _activeAnchor.classList.remove('gt-active');
      _activeAnchor = null;
    }
  }

  function showTooltip(anchor, pop) {
    hideAll();
    document.body.appendChild(pop);
    positionTooltip(pop, anchor);
    bindPopHandlers(pop);
    pop.classList.add('gt-show');
    anchor.classList.add('gt-active');
    _activePop = pop;
    _activeAnchor = anchor;
  }

  function handleInteraction(ev, glossary) {
    const el = ev.target.closest('glossary-term');
    if (!el) return;
    const key = el.dataset.gtKey;
    if (!key) return;
    const entry = glossary[key];
    if (!entry) return;

    if (ev.type === 'mouseenter') {
      if ('ontouchstart' in window) return;
      cancelHide();
      const pop = buildTooltip(key, entry, glossary);
      showTooltip(el, pop);
    } else if (ev.type === 'mouseleave') {
      if ('ontouchstart' in window) return;
      // No timer here — hiding is driven by handlePointerMove, which keeps the
      // tooltip open while the pointer is anywhere between the term and the
      // tooltip, and hides only when it genuinely leaves that region.
    } else if (ev.type === 'click') {
      if (!('ontouchstart' in window)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (_activePop && _activeAnchor === el) {
        // Tapping the already-open term toggles it closed.
        hideAll();
      } else {
        const pop = buildTooltip(key, entry, glossary);
        showTooltip(el, pop);
      }
    }
  }

  function cancelHide() {
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
  }

  function scheduleHide(delay = 250) {
    if (_suppressHide) return;
    if (_hideTimer) return;
    _hideTimer = setTimeout(hideAll, delay);
  }

  // Union of the anchor and popup bounding rects, expanded by a padding so the
  // pointer can travel from the term to a distant tooltip across unrelated page
  // content without the tooltip vanishing mid-transit. Returns null if there is
  // nothing visible yet.
  const REGION_PAD = 12;
  function activeRegion() {
    const pop = _activePop;
    const anchor = _activeAnchor;
    if (!pop) return null;
    const rects = [pop.getBoundingClientRect()];
    if (anchor) rects.push(anchor.getBoundingClientRect());
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const rc of rects) {
      if (rc.width === 0 && rc.height === 0) continue;
      l = Math.min(l, rc.left); t = Math.min(t, rc.top);
      r = Math.max(r, rc.right); b = Math.max(b, rc.bottom);
    }
    if (!isFinite(l)) return null;
    return { left: l - REGION_PAD, top: t - REGION_PAD, right: r + REGION_PAD, bottom: b + REGION_PAD };
  }

  function pointerInsideRegion(region, x, y) {
    return x >= region.left && x <= region.right && y >= region.top && y <= region.bottom;
  }

  // Single rule for keeping the tooltip alive: hide only once the pointer leaves
  // the union of the term and the tooltip (with padding). Hovering the tooltip
  // to read or select its text keeps it open even when the tooltip sits some
  // distance away from the term.
  function handlePointerMove(ev) {
    if ('ontouchstart' in window) return;
    const region = activeRegion();
    if (!region) return;
    if (pointerInsideRegion(region, ev.clientX, ev.clientY)) {
      cancelHide();
    } else {
      scheduleHide();
    }
  }

  function handlePopInteraction(ev) {
    if ('ontouchstart' in window) return;
    if (ev.type === 'mousedown') {
      if (ev.target.closest('.gt-pop')) _suppressHide = true;
      return;
    }
    if (ev.type === 'mouseover' || ev.type === 'mouseenter') {
      // Pointer is now over the popup; cancel any pending hide.
      if (ev.target.closest('.gt-pop')) cancelHide();
    }
  }

  // Popup hover handlers. Hiding is driven by handlePointerMove (the union-region
  // check); these only cancel a pending hide when the pointer is over the popup
  // and mark a text-selection drag so it is never cut short. Removed on fade-out.
  function bindPopHandlers(pop) {
    pop.addEventListener('mouseover', handlePopInteraction);
    pop.addEventListener('mouseenter', handlePopInteraction);
    pop.addEventListener('mousedown', handlePopInteraction);
  }

  const RE_SPECIAL = /[.*+?^${}()|[\]\\]/g;
  const escReg = (s) => (typeof s === 'string' ? s.replace(RE_SPECIAL, '\\$&') : '');

  // Build term-matching regexes over canonical keys + per-entry synonyms.
  //
  // Two regexes, not one, because they need different case-sensitivity and one
  // regex cannot apply per-branch case flags in the target engines:
  //   - `keyRe`: canonical keys, case-sensitive. Prevents 2-3 letter abbreviation
  //     keys from false-positive on everyday English prose words.
  //   - `synRe`: multi-word synonyms, case-insensitive, so title-case synonyms
  //     match lowercase prose.
  //
  // `resolve` is the single source of truth {lowercaseText -> canonical key} used
  // by markTerms to open the correct tooltip. Collisions are resolved
  // deterministically (real entry with a definition wins over an alias stub;
  // canonical keys win over synonyms; otherwise first-registered wins) and logged.
  function buildGlossaryMeta(glossary) {
    const keys = Object.keys(glossary).filter(k => k[0] !== '_');

    const resolve = new Map();
    const extraSeparators = ['/'];
    const sepPattern = extraSeparators.map(escReg).join('');
    const boundary = `[a-zA-Z0-9\\p{L}${sepPattern}]`;
    const register = (text, key, ci, allowOverwrite) => {
      const low = text.toLowerCase();
      const existing = resolve.get(low);
      if (existing !== undefined && existing !== key) {
        if (!allowOverwrite) {
          console.warn(`glossary-tooltip: match text "${text}" collides (${existing} vs ${key}); keeping ${existing}`);
          return null;
        }
      }
      resolve.set(low, key);
      return escReg(text);
    };

    const keyBranches = [];
    const synBranches = [];

    // Canonical keys: case-sensitive; a real entry (has a definition) beats an
    // alias stub when two keys differ only by case.
    for (const k of keys) {
      const low = k.toLowerCase();
      const existing = resolve.get(low);
      if (existing !== undefined && existing !== k) {
        const kReal = !!glossary[k]?.definition;
        const exReal = !!glossary[existing]?.definition;
        if (!(kReal && !exReal)) continue; // keep existing (real wins, or first stays)
      }
      if (resolve.get(low) === k) continue; // already the owner
      resolve.set(low, k);
      keyBranches.push(escReg(k));
    }

    // Synonyms: case-insensitive; never overwrite a canonical key.
    for (const k of keys) {
      const syns = glossary[k]?.synonyms;
      if (!Array.isArray(syns)) continue;
      for (const s of syns) {
        if (typeof s !== 'string' || !s) continue;
        if (resolve.has(s.toLowerCase())) continue; // canonical key owns it
        const payload = register(s, k, true, false);
        if (payload) synBranches.push(payload);
      }
    }

    // Longest first so the alternation matches the greedier branch first.
    keyBranches.sort((a, b) => b.length - a.length);
    synBranches.sort((a, b) => b.length - a.length);

    const keyRe = keyBranches.length
      ? new RegExp(`(?<!${boundary})(${keyBranches.join('|')})(?!${boundary})`, 'gu')
      : null;
    const synRe = synBranches.length
      ? new RegExp(`(?<!${boundary})(${synBranches.join('|')})(?!${boundary})`, 'giu')
      : null;

    const noTooltipPhrases = [];
    for (const k of keys) {
      const nt = glossary[k]?.noTooltip;
      if (nt) noTooltipPhrases.push(...nt);
    }
    let noTooltipRe = null;
    if (noTooltipPhrases.length) {
      const ntPattern = noTooltipPhrases
        .map(escReg).map(p => p.replace(/[\s\u00A0]+/g, '[\\s\\u00A0]+'))
        .join('|');
      noTooltipRe = new RegExp(ntPattern, 'gi');
    }

    return { keys, keyRe, synRe, noTooltipRe, resolve };
  }

  function markTerms(body, glossary, meta) {
    const { keyRe, synRe, noTooltipRe, resolve } = meta;

    // Collect text nodes first — mutating DOM during TreeWalker corrupts iteration
    const textNodes = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node;
    const excludeTags = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'GLOSSARY-TERM', 'GLOSSARY-TOOLTIPS']);
    while ((node = walker.nextNode())) {
      const p = node.parentNode;
      const gn = p.nodeName;
      if (excludeTags.has(gn) || gn === 'TEXTAREA' || gn === 'INPUT') continue;
      if (p.closest('.gt-pop') || p.closest('.no-gt')) continue;
      textNodes.push(node);
    }

    for (const tn of textNodes) {
      let html = tn.textContent;
      const phMap = new Map(); // noTooltip placeholders

      if (noTooltipRe) {
        noTooltipRe.lastIndex = 0;
        html = html.replace(noTooltipRe, m => {
          const ph = `\u0000gt${phMap.size}\u0000`;
          phMap.set(ph, m);
          return ph;
        });
      }

      // Synonyms first (case-insensitive). A matched phrase maps to its canonical key.
      if (synRe) {
        synRe.lastIndex = 0;
        html = html.replace(synRe, (match) => {
          const dk = resolve.get(match.toLowerCase());
          if (!dk) return match;
          const ph = `\u0000gt${phMap.size}\u0000`;
          phMap.set(ph, `<glossary-term data-gt="${esc(dk)}" data-gt-match="${esc(match)}">${esc(match)}</glossary-term>`);
          return ph;
        });
      }

      // Canonical keys (case-sensitive) on the placeholder-protected text so key
      // matching never runs inside a wrapped synonym.
      if (keyRe) {
        keyRe.lastIndex = 0;
        if (keyRe.test(html)) {
          keyRe.lastIndex = 0;
          html = html.replace(keyRe, (match) => {
            const dk = resolve.get(match.toLowerCase());
            if (!dk) return match;
            return `<glossary-term data-gt="${esc(dk)}" data-gt-match="${esc(match)}">${esc(match)}</glossary-term>`;
          });
        }
      }

      if (phMap.size) html = html.replace(NOPLACE_RE, m => phMap.get(m) ?? m);

      const wrapper = document.createElement('span');
      wrapper.innerHTML = html;

      for (const el of wrapper.querySelectorAll('glossary-term')) {
        const dk = el.getAttribute('data-gt');
        if (!glossary[dk]) { el.remove(); continue; }
        el.dataset.gtKey = el.getAttribute('data-gt');
      }

      tn.parentNode.replaceChild(wrapper, tn);
    }
  }

  let _instanceCount = 0;
  let _documentTeardown = null;
  let _glossary = null;   // resolved glossary shared by all instances (one URL)
  let _loading = false;

  function attachDocumentListeners() {
    if (_documentTeardown || !_glossary || _instanceCount === 0) return;

    const glossary = _glossary;
    const handler = (e) => handleInteraction(e, glossary);
    document.addEventListener('mouseenter', handler, true);
    document.addEventListener('mouseleave', handler, true);
    document.addEventListener('click', handler);
    document.addEventListener('mousemove', handlePointerMove);

    const docClick = (e) => {
      if (!e.target.closest('glossary-term') && !e.target.closest('.gt-pop')) hideAll();
    };
    document.addEventListener('click', docClick);
    // Clearing the selection suppression must not leave a stale "outside the
    // region" state: if the pointer ended the drag outside the region, start
    // the hide countdown now instead of waiting for the next mousemove.
    const docMouseUp = (ev) => {
      _suppressHide = false;
      const region = activeRegion();
      if (region && !pointerInsideRegion(region, ev.clientX, ev.clientY)) scheduleHide();
    };
    document.addEventListener('mouseup', docMouseUp);
    const scrollHandler = () => hideAll();
    window.addEventListener('scroll', scrollHandler);

    _documentTeardown = () => {
      document.removeEventListener('mouseenter', handler, true);
      document.removeEventListener('mouseleave', handler, true);
      document.removeEventListener('click', handler);
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('click', docClick);
      document.removeEventListener('mouseup', docMouseUp);
      window.removeEventListener('scroll', scrollHandler);
    };
  }

  function detachDocumentListeners() {
    if (_instanceCount > 0 || !_documentTeardown) return;
    _documentTeardown();
    _documentTeardown = null;
  }

  class GlossaryTooltips extends HTMLElement {
    #loaded = false;
    #glossary = null;

    connectedCallback() {
      _instanceCount += 1;
      attachDocumentListeners();
      if (this.#loaded) return;
      this.#loaded = true;
      if (_glossary) { this.#glossary = _glossary; markTerms(document.body, _glossary, buildGlossaryMeta(_glossary)); return; }
      if (_loading) return; // another instance is already fetching

      _loading = true;
      fetch(GLOSSARY_URL)
        .then(r => r.json())
        .then(glossary => {
          _loading = false;
          _glossary = glossary;
          this.#glossary = glossary;
          markTerms(document.body, glossary, buildGlossaryMeta(glossary));
          attachDocumentListeners();
        })
        .catch(() => { _loading = false; console.warn('Glossary tooltips: could not fetch glossary JSON'); });
    }

    disconnectedCallback() {
      _instanceCount = Math.max(0, _instanceCount - 1);
      detachDocumentListeners();
    }
  }

  customElements.define('glossary-tooltips', GlossaryTooltips);
})();
