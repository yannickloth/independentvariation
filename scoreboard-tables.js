// scoreboard-tables.js — filter every table, and sort every ranking table.
//
// The scoreboard is rendered from the published JSON at build time, so the
// numbers need no fetch. This component only re-orders and hides rows that are
// already on the page, which keeps the page readable without JavaScript and
// indexable by search engines.
//
// Both features are derived from the rendered table itself:
//   - a table is a RANKING when its first body cell parses as a rank, i.e. the
//     rows are numbered 1..n in the rendered order;
//   - a column is NUMERIC when every body cell parses as a number (a dash or a
//     blank counts as empty and is ignored);
//   - a column is a mechanism LIST when every body cell is a run of ids
//     separated by commas.
// Nothing is hand-written per table, so a new table on the page is covered.

(() => {
  const tables = Array.from(document.querySelectorAll("table"));

  const headRow = (t) => (t.tHead && t.tHead.rows[0]) || t.rows[0];
  const labels = (t) => Array.from(headRow(t).cells).map((c) => c.textContent.trim());
  // When there is no <tbody>, t.rows includes the header, so it is dropped here.
  const bodyRows = (t) => {
    const rows = Array.from(t.tBodies[0] ? t.tBodies[0].rows : t.rows);
    const head = headRow(t);
    return rows[0] === head ? rows.slice(1) : rows;
  };
  const text = (row, i) => (row.cells[i] ? row.cells[i].textContent.trim() : "");

  const isNumeric = (s) => s !== "" && s !== "\u2014" && Number.isFinite(Number(s.replace(/,/g, "")));
  const isEmpty = (s) => s === "" || s === "\u2014" || s === "\u2013" || s === "-";
  const isList = (s) => !isEmpty(s) && /^[A-Za-z]{1,3}\d{0,2}(\s*,\s*[A-Za-z]{1,3}\d{0,2})*$/.test(s);

  // The id prefix identifies the mechanism family, so R2 and Y12 both reduce to
  // a family letter that orders the lists consistently.
  const listKey = (s) =>
    s.split(",").map((x) => x.trim()).filter(Boolean)
      .map((id) => /^([A-Za-z]+)\d*$/.exec(id)?.[1].toLowerCase() ?? id.toLowerCase())
      .sort().join(" ");

  const model = tables.map((table, i) => {
    const labels_ = labels(table);
    const rows = bodyRows(table);
    const first = rows.length ? text(rows[0], 0) : "";
    const numeric = rows.length ? text(rows[rows.length - 1], 0) : "";
    return {
      index: i,
      table,
      labels: labels_,
      rows,
      isRanking: /^\d+$/.test(first) && /^\d+$/.test(numeric) && Number(numeric) === rows.length,
      kinds: labels_.map((_, c) => {
        const vals = rows.map((r) => text(r, c)).filter((v) => v !== "");
        if (vals.length && vals.every(isNumeric)) return "number";
        if (vals.length && vals.every(isList)) return "list";
        return "text";
      }),
    };
  });

  const visible = () => model.filter((m) => m.rows.length > 0);

  // ── one panel per table ────────────────────────────────────────────────────
  model.forEach((m) => {
    if (!m.rows.length) return;

    const bar = document.createElement("div");
    bar.className = "scoreboard-controls";

    const field = (labelText, control) => {
      const l = document.createElement("label");
      l.className = "scoreboard-field";
      l.append(document.createTextNode(labelText), control);
      return l;
    };

    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "form-control form-control-sm";
    filter.placeholder = "filter rows\u2026";
    filter.autocomplete = "off";
    bar.append(field("Filter", filter));

    // A ranking table gets a sort control over its numeric columns.
    const numericCols = m.labels
      .map((label, c) => ({ label, c }))
      .filter(({ c }) => m.kinds[c] === "number" && !/\brank\b/i.test(m.labels[c]));

    let select = null;
    let dir = null;
    if (m.isRanking && numericCols.length) {
      select = document.createElement("select");
      select.className = "form-select form-select-sm";
      numericCols.forEach(({ label, c }) => {
        const o = document.createElement("option");
        o.value = String(c);
        o.textContent = label;
        select.append(o);
      });
      bar.append(field("Sort by", select));

      dir = document.createElement("button");
      dir.type = "button";
      dir.className = "btn btn-sm btn-outline-secondary";
      bar.append(dir);
    }

    const status = document.createElement("p");
    status.className = "scoreboard-status";
    status.setAttribute("role", "status");

    m.table.parentNode.insertBefore(bar, m.table);
    m.table.parentNode.insertBefore(status, m.table);

    // The rendered order is the default, and it is kept unless the reader asks
    // for another. `state.col` starts at the first numeric column, or -1 when
    // the table is not sorted.
    const state = { col: select ? Number(select.value) : -1, desc: true, query: "" };
    if (select) {
      dir.textContent = state.desc ? "Highest first" : "Lowest first";
      select.addEventListener("change", () => {
        state.col = Number(select.value);
        dir.textContent = state.desc ? "Highest first" : "Lowest first";
        apply();
      });
      dir.addEventListener("click", () => {
        state.desc = !state.desc;
        dir.textContent = state.desc ? "Highest first" : "Lowest first";
        apply();
      });
    }
    filter.addEventListener("input", () => { state.query = filter.value; apply(); });

    function apply() {
      const q = state.query.trim().toLowerCase();
      let shown = 0;
      for (const row of m.rows) {
        const matches = !q || row.textContent.toLowerCase().includes(q);
        row.hidden = !matches;
        if (matches) shown += 1;
      }
      if (state.col >= 0) {
        const kind = m.kinds[state.col];
        const key = (row) => {
          const raw = text(row, state.col);
          if (kind === "number") return isEmpty(raw) ? null : Number(raw.replace(/,/g, ""));
          if (kind === "list") return isEmpty(raw) ? null : listKey(raw);
          return raw.toLowerCase();
        };
        m.rows.sort((a, b) => {
          const ka = key(a), kb = key(b);
          // An empty cell always sorts last, whichever direction is chosen.
          if (ka === null && kb === null) return 0;
          if (ka === null) return 1;
          if (kb === null) return -1;
          const cmp = typeof ka === "number" ? ka - kb : String(ka).localeCompare(String(kb));
          return state.desc ? -cmp : cmp;
        });
        for (const row of m.rows) m.table.tBodies[0].appendChild(row);
      }
      if (!state.query) {
        status.textContent = m.isRanking
          ? `All ${m.rows.length} rows, in the published order.`
          : `All ${m.rows.length} rows.`;
      } else {
        status.textContent = `${shown} of ${m.rows.length} rows shown.`;
      }
    }

    apply();
  });
})();
