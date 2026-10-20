// Accordion browser for the Knowledge-Gap Indicators posts.
// All post content lives on this page as .kg-post blocks. The script
// builds the left-hand list from those blocks, grouped by pattern
// family (families and the patterns inside them sorted
// alphabetically), and opens one post at a time with its family framing.
(function () {
  "use strict";

  const SERIES = "Patterns & Constructs as Knowledge-Gap Indicators";

  const viewer = document.getElementById("kg-viewer");
  const listEl = document.getElementById("kg-list");
  if (!viewer || !listEl) return;

  // Quarto writes an icon character into every callout title. The boxes
  // draw their icon from the frame, so drop the stray glyph.
  viewer.querySelectorAll(".callout-title-container").forEach(function (el) {
    Array.from(el.childNodes).forEach(function (node) {
      if (node.nodeType !== 3) return;
      const clean = node.nodeValue.replace(
        /[\u0000-\u001f\u007f-\u009f\uE000-\uF8FF\uFFFD\uFFFE\uFFFF]/g,
        ""
      );
      if (clean !== node.nodeValue) node.nodeValue = clean;
    });
  });

  const nodes = Array.from(viewer.querySelectorAll(".kg-post[data-slug]"));
  if (nodes.length === 0) return;

  const posts = nodes.map(function (el) {
    return {
      slug: el.dataset.slug,
      pattern: el.dataset.pattern,
      group: el.dataset.group || "other",
      groupLabel: el.dataset.groupLabel || "Other",
      el: el,
    };
  });
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  const introSrc = new Map();
  viewer.querySelectorAll(".kg-group-intro[data-group]").forEach(function (el) {
    introSrc.set(el.dataset.group, el);
  });
  let items = [];
  let groups = [];
  let current = null;
  let defaultSlug = posts[0] ? posts[0].slug : null;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Header bar above the open post: title + copy-link control.
  const bar = document.createElement("div");
  bar.className = "kg-post-bar";
  bar.innerHTML =
    '<span class="kg-post-bar-title"></span>' +
    '<button type="button" class="kg-copy">Copy link</button>';
  viewer.insertBefore(bar, viewer.firstChild);
  const barTitle = bar.querySelector(".kg-post-bar-title");
  const copyBtn = bar.querySelector(".kg-copy");

  // Family framing, shown above the open post.
  const intro = document.createElement("div");
  intro.className = "kg-intro";
  intro.hidden = true;
  bar.after(intro);

  // Collapse control, above the post list.
  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "kg-collapse-btn";
  collapseBtn.textContent = "Collapse all but current";
  listEl.before(collapseBtn);

  copyBtn.addEventListener("click", function () {
    const url = location.pathname.replace(/[^/]*$/, "") + "#" + current;
    const done = function () {
      copyBtn.textContent = "Copied";
      setTimeout(function () {
        copyBtn.textContent = "Copy link";
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, done);
    } else {
      done();
    }
  });

  // One list entry: the pattern name. The entries carry no series number —
  // the posts are a family list, not an ordered sequence, and a running
  // number said nothing about the pattern.
  function itemHtml(p) {
    return (
      '<a class="kg-item" data-slug="' +
      esc(p.slug) +
      '" href="#' +
      esc(p.slug) +
      '">' +
      '<span class="kg-name">' +
      esc(p.pattern) +
      "</span></a>"
    );
  }

  function setGroup(groupEl, open) {
    groupEl.classList.toggle("kg-group-closed", !open);
    const head = groupEl.querySelector(".kg-group-head");
    if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function buildList() {
    const map = new Map();
    for (const p of posts) {
      if (!map.has(p.group)) {
        map.set(p.group, { id: p.group, label: p.groupLabel, posts: [] });
      }
      map.get(p.group).posts.push(p);
    }
    // Families and the patterns inside them are both alphabetical.
    const ordered = Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    ordered.forEach(function (g) {
      g.posts.sort((a, b) => a.pattern.localeCompare(b.pattern));
    });
    if (ordered.length && ordered[0].posts.length) {
      defaultSlug = ordered[0].posts[0].slug;
    }

    listEl.innerHTML = ordered
      .map(function (g) {
        return (
          '<section class="kg-group" data-group="' +
          esc(g.id) +
          '">' +
          '<button type="button" class="kg-group-head" aria-expanded="true">' +
          '<span class="kg-group-caret" aria-hidden="true"></span>' +
          '<span class="kg-group-label">' +
          esc(g.label) +
          "</span>" +
          '<span class="kg-group-count">' +
          g.posts.length +
          "</span>" +
          "</button>" +
          '<div class="kg-group-body">' +
          g.posts.map(itemHtml).join("") +
          "</div></section>"
        );
      })
      .join("");

    items = Array.from(listEl.querySelectorAll(".kg-item"));
    items.forEach(function (el) {
      el.addEventListener("click", function (ev) {
        ev.preventDefault();
        const slug = el.dataset.slug;
        // Clicking an item always opens it. A click on the post that is
        // already open leaves it open — never toggles it closed.
        if (fromHash() === slug) {
          show(slug);
        } else {
          location.hash = slug;
        }
      });
    });

    groups = Array.from(listEl.querySelectorAll(".kg-group"));
    groups.forEach(function (groupEl) {
      groupEl.querySelector(".kg-group-head").addEventListener("click", function () {
        setGroup(groupEl, groupEl.classList.contains("kg-group-closed"));
      });
    });

    // Default: only the first family is open.
    groups.forEach(function (groupEl, i) {
      setGroup(groupEl, i === 0);
    });

    collapseBtn.addEventListener("click", function () {
      const keep = current ? bySlug.get(current).group : null;
      groups.forEach(function (groupEl) {
        setGroup(groupEl, groupEl.dataset.group === keep);
      });
    });
  }

  function expandGroupOf(slug) {
    const p = bySlug.get(slug);
    if (!p) return;
    const groupEl = listEl.querySelector('.kg-group[data-group="' + p.group + '"]');
    if (groupEl) setGroup(groupEl, true);
  }

  function setActive(slug) {
    items.forEach(function (el) {
      const on = el.dataset.slug === slug;
      el.classList.toggle("kg-active", on);
      if (on) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
    });
  }

  function showIntro(group) {
    const src = introSrc.get(group);
    intro.innerHTML = "";
    if (!src) {
      intro.hidden = true;
      return;
    }
    src.childNodes.forEach(function (node) {
      intro.appendChild(node.cloneNode(true));
    });
    intro.hidden = false;
  }

  function close() {
    posts.forEach(function (p) {
      p.el.hidden = true;
    });
    current = null;
    setActive(null);
    bar.classList.remove("kg-bar-on");
    barTitle.textContent = "";
    intro.hidden = true;
    intro.innerHTML = "";
    viewer.classList.add("kg-empty");
  }

  function show(slug) {
    const p = bySlug.get(slug) || posts[0];
    posts.forEach(function (q) {
      q.el.hidden = q.slug !== p.slug;
    });
    current = p.slug;
    setActive(p.slug);
    expandGroupOf(p.slug);
    showIntro(p.group);
    bar.classList.add("kg-bar-on");
    barTitle.textContent = p.pattern;
    viewer.classList.remove("kg-empty");
    document.title = p.pattern + " — " + SERIES + " — IVP";
    // Bring the opened post to the top of the pane.
    const top = bar.getBoundingClientRect().top;
    if (top < 64) window.scrollTo(0, window.scrollY + top - 76);
  }

  function fromHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
    return bySlug.get(raw) ? raw : null;
  }

  buildList();
  window.addEventListener("hashchange", function () {
    const slug = fromHash();
    if (slug) show(slug);
    else close();
  });

  const initial = fromHash();
  if (initial) {
    show(initial);
  } else {
    location.hash = defaultSlug;
    show(defaultSlug);
  }
})();
