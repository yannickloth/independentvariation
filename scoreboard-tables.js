// scoreboard-tables.js — sort and filter the scoreboard tables in place.
//
// The scoreboard is rendered from the published JSON at build time, so the
// numbers need no fetch. This component only re-orders and hides the rows that
// are already on the page, which keeps the page readable without JavaScript and
// indexable by search engines.
//
// It activates on the scoreboard only: it returns immediately unless all four
// scoreboard tables are present.

(() => {
  const HEADERS = {
    combined: ["Rank", "Language", "Version", "Core Coupling", "Ecosystem Coupling", "Overall Coupling Quality"],
    core: ["Language", "Coupling Score"],
    meta: ["Language", "Ecosystem Coupling Score"],
    presence: ["Language (Version)", "Core", "Meta"],
  };

  const headerOf = (table) => {
    const row = table.tHead && table.tHead.rows[0];
    return row ? Array.from(row.cells).map((c) => c.textContent.trim()) : [];
  };
  const match = (cells, want) => want.every((w, i) => cells[i] === w);

  const tables = Array.from(document.querySelectorAll("table"));
  const found = {};
  for (const table of tables) {
    const cells = headerOf(table);
    for (const [name, want] of Object.entries(HEADERS)) {
      if (!found[name] && match(cells, want)) found[name] = table;
    }
  }
  if (!found.combined || !found.core || !found.meta || !found.presence) return;

  // Column positions are read from the header, so adding a column to a table
  // does not silently break the sort.
  const colOf = (table, label) => headerOf(table).indexOf(label);
  const nameOf = new Map(Object.entries(found).map(([n, t]) => [t, n]));
  const langCol = new Map();
  for (const [name, table] of Object.entries(found)) {
    const cells = headerOf(table);
    langCol.set(table, Math.max(0, cells.findIndex((c) => c.startsWith("Language"))));
  }
  const CORE_COL = colOf(found.combined, "Core Coupling");
  const META_COL = colOf(found.combined, "Ecosystem Coupling");
  const RANK_COL = colOf(found.combined, "Rank");

  const rowsOf = (table) => Array.from(table.tBodies[0].rows);
  // "Rust (1.96)" and "Ada (2022)" reduce to the language name.
  const keyOf = (table, row) =>
    row.cells[langCol.get(table)].textContent.replace(/\s*\([^)]*\)\s*$/, "").trim();

  const index = new Map();
  for (const row of rowsOf(found.combined)) {
    const key = keyOf(found.combined, row);
    index.set(key, {
      // The rank column IS the published ordering: Core coupling, then
      // Ecosystem coupling. Sorting by rank therefore reproduces the numbers.
      rank: Number(row.cells[RANK_COL].textContent.trim()),
      core: Number(row.cells[CORE_COL].textContent.trim()),
      meta: Number(row.cells[META_COL].textContent.trim()),
      name: key,
    });
  }

  // Each key has a natural direction: the rank reads best-first, scores rank
  // highest-first, names read A–Z.
  const NATURAL = { core: 1, meta: -1, name: 1 };
  let sort = "core";
  let dir = NATURAL[sort];
  let query = "";

  const ordered = () => {
    const keys = Array.from(index.values());
    keys.sort((a, b) => {
      let raw;
      if (sort === "name") raw = a.name.localeCompare(b.name);
      else if (sort === "core") raw = a.rank - b.rank; // rank = Core, then Ecosystem
      else raw = a.meta - b.meta;
      // Ties keep the published order, so the Rank column always reads in
      // sequence when the table is ordered by rank.
      return dir * raw || a.rank - b.rank;
    });
    return keys.map((k) => k.name);
  };

  const apply = () => {
    const order = ordered();
    const rank = new Map(order.map((k, i) => [k, i]));
    const q = query.trim().toLowerCase();
    let visible = 0;

    for (const table of Object.values(found)) {
      const rows = rowsOf(table);
      rows.sort((a, b) => {
        const ra = rank.has(keyOf(table, a)) ? rank.get(keyOf(table, a)) : order.length;
        const rb = rank.has(keyOf(table, b)) ? rank.get(keyOf(table, b)) : order.length;
        return ra - rb;
      });
      for (const row of rows) {
        const key = keyOf(table, row);
        const show = !q || key.toLowerCase().includes(q);
        row.hidden = !show;
        table.tBodies[0].appendChild(row);
      }
    }
    for (const row of rowsOf(found.combined)) {
      if (!row.hidden) visible += 1;
    }
    status.textContent = visible === order.length
      ? `All ${order.length} languages.`
      : `${visible} of ${order.length} languages shown.`;
  };

  // ── controls ───────────────────────────────────────────────────────────────
  const bar = document.createElement("div");
  bar.className = "scoreboard-controls";
  bar.innerHTML =
    '<label class="scoreboard-field">Filter' +
    '<input id="scoreboard-filter" type="search" class="form-control form-control-sm" ' +
    'placeholder="language or version…" autocomplete="off"></label>' +
    '<label class="scoreboard-field">Sort by' +
    '<select id="scoreboard-sort" class="form-select form-select-sm">' +
    '<option value="core">Core coupling</option>' +
    '<option value="meta">Ecosystem coupling</option>' +
    '<option value="name">Name</option></select></label>' +
    '<button id="scoreboard-dir" type="button" class="btn btn-sm btn-outline-secondary"></button>';

  const status = document.createElement("p");
  status.className = "scoreboard-status";
  status.setAttribute("role", "status");

  const combined = found.combined;
  combined.parentNode.insertBefore(bar, combined);
  combined.parentNode.insertBefore(status, combined);

  const filter = bar.querySelector("#scoreboard-filter");
  const select = bar.querySelector("#scoreboard-sort");
  const button = bar.querySelector("#scoreboard-dir");

  const labelDir = () => {
    if (sort === "name") button.textContent = dir === 1 ? "A \u2192 Z" : "Z \u2192 A";
    else if (sort === "core") button.textContent = dir === 1 ? "Best first" : "Worst first";
    else button.textContent = dir === 1 ? "Highest first" : "Lowest first";
  };

  filter.addEventListener("input", () => { query = filter.value; apply(); });
  select.addEventListener("change", () => {
    sort = select.value;
    dir = NATURAL[sort];
    labelDir();
    apply();
  });
  button.addEventListener("click", () => { dir = -dir; labelDir(); apply(); });

  labelDir();
  apply();
})();
