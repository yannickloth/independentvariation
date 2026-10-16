// Mark the navbar entry for the section the current page belongs to.
// Quarto only marks an entry active on an exact page match, so a page under a
// section (for example software/design/architecture/x.html) shows no context in
// the navbar. Match by path prefix instead, longest match wins.
(function () {
  "use strict";

  function trim(p) {
    return p.replace(/index\.html$/, "").replace(/\/+$/, "");
  }

  function run() {
    var navbar = document.querySelector(".navbar");
    if (!navbar) return;

    var here = trim(window.location.pathname);
    var links = navbar.querySelectorAll(
      ".navbar-nav.me-auto a.nav-link, .navbar-nav.me-auto .dropdown-item"
    );

    var best = null;
    var bestLen = -1;

    links.forEach(function (a) {
      var p = trim(a.pathname || "");
      // The site root would prefix-match everything; only an exact hit counts.
      if (p === "" || p === "/") return;
      if (here !== p && here.indexOf(p + "/") !== 0) return;
      if (p.length > bestLen) {
        best = a;
        bestLen = p.length;
      }
    });

    if (!best) return;
    var target = best.classList.contains("dropdown-item")
      ? best.closest(".nav-item").querySelector(".nav-link")
      : best;
    if (!target) return;
    target.classList.add("active");
    target.setAttribute("aria-current", "true");
  }

  if (document.readyState === "loading") {
    window.document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
