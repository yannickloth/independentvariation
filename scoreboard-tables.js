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

  // A code span in the rendered HTML is a mechanism list, so the strongest
  // signal is the element itself: a cell that contains <code> is a list, and it
  // wins over the numeric test (a single-id list such as "Y4" also parses as a
  // number, and must not be treated as one).
  const isListCell = (row, c) => {
    const cell = row.cells[c];
    return !!cell && !!cell.querySelector("code");
  };
  // A cost cell may carry an uncapped value in parentheses, e.g. "-15 (-28)".
  // The capped value leads, so that is the key; the parentheses are detail.
  const costValue = (s) => {
    const t = s.trim();
    if (t === "0") return 0;
    const m = /^([\u2212-])(\d+(?:\.\d+)?)/.exec(t);
    return m ? -Number(m[2]) : null;
  };
  const isCost = (s) => costValue(s) !== null;
  const isNumeric = (s) => s !== "" && s !== "\u2014" && Number.isFinite(Number(s.replace(/,/g, ""))) && !s.includes("(");
  const isEmpty = (s) => s === "" || s === "\u2014" || s === "\u2013" || s === "-";
  const isList = (s) => !isEmpty(s) && /^[A-Za-z]{1,3}\d{0,2}(\s*,\s*[A-Za-z]{1,3}\d{0,2})*$/.test(s);

  // The id prefix identifies the mechanism family, so R2 and Y12 both reduce to
  // a family letter that orders the lists consistently.
  const listKey = (s) =>
    s.split(",").map((x) => x.trim()).filter(Boolean)
      .map((id) => /^([A-Za-z]+)\d*$/.exec(id)?.[1].toLowerCase() ?? id.toLowerCase())
      .sort().join(" ");

  // A "label" column is a band word plus a characterization, e.g. "Pragmatic FP"
  // or a star run. It sorts by the word itself, ignoring the stars.
  const isLabel = (s) => !isEmpty(s) && !isNumeric(s) && /\s/.test(s);

  const model = tables.map((table, i) => {
    const labels_ = labels(table);
    const rows = bodyRows(table);
    const first = rows.length ? text(rows[0], 0) : "";
    const numeric = rows.length ? text(rows[rows.length - 1], 0) : "";
    // The rank column carries the published order, so it is a sortable key and
    // it is also the tie-break for every other key.
    const rankCol = /^rank$/i.test(labels_[0] || "") ? 0 : -1;
    return {
      index: i,
      table,
      labels: labels_,
      rows,
      rankCol,
      isRanking: rankCol === 0 && /^\d+$/.test(first) && /^\d+$/.test(numeric)
                 && Number(numeric) === rows.length,
      kinds: labels_.map((_, c) => {
        const vals = rows.map((r) => text(r, c)).filter((v) => v !== "");
        if (rows.length && rows.every((r) => isListCell(r, c) || isEmpty(text(r, c)))) return "list";
        if (vals.length && vals.every(isCost)) return "cost";
        if (vals.length && vals.every(isNumeric)) return "number";
        if (vals.length && vals.every(isList)) return "list";
        if (vals.length && vals.every(isLabel)) return "label";
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

    const sortableCols = m.labels
      .map((label, c) => ({ label, c, kind: m.kinds[c] }))
      .filter(({ c, kind }) => c !== m.rankCol && (kind === "number" || kind === "cost" || kind === "list" || kind === "label"))
      .sort((a, b) => (a.label === "Rank" ? -1 : b.label === "Rank" ? 1 : a.c - b.c));

    let select = null;
    let dir = null;
    if (m.isRanking && sortableCols.length) {
      select = document.createElement("select");
      select.className = "form-select form-select-sm";
      // Rank is the first option and the default: the page opens in the
      // published order, and any other key is a deliberate choice.
      if (m.rankCol >= 0) {
        const o = document.createElement("option");
        o.value = String(m.rankCol);
        o.textContent = "Rank";
        select.append(o);
      }
      sortableCols.forEach(({ label, c }) => {
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

    // The page opens in the published order. The sort control starts on Rank,
    // so nothing is re-ordered until the reader chooses another key. Rank reads
    // best-first (ascending) and every score reads highest-first; the button
    // reverses whichever is selected.
    const naturalDesc = (col) => !(m.rankCol >= 0 && col === m.rankCol) && m.kinds[col] !== "cost";
    const state = { col: select ? Number(select.value) : -1, desc: naturalDesc(select ? Number(select.value) : -1), query: "" };
    const dirLabel = () => {
      if (m.rankCol >= 0 && state.col === m.rankCol) return state.desc ? "Worst first" : "Best first";
      if (m.kinds[state.col] === "cost") return state.desc ? "Most costly first" : "Cheapest first";
      return state.desc ? "Highest first" : "Lowest first";
    };
    if (select) {
      dir.textContent = dirLabel();
      select.addEventListener("change", () => {
        state.col = Number(select.value);
        state.desc = naturalDesc(state.col);
        dir.textContent = dirLabel();
        apply();
      });
      dir.addEventListener("click", () => {
        state.desc = !state.desc;
        dir.textContent = dirLabel();
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
          if (kind === "cost") return isEmpty(raw) ? null : costValue(raw);
          if (kind === "number") return isEmpty(raw) ? null : Number(raw.replace(/,/g, ""));
          if (kind === "list") return isEmpty(raw) ? null : listKey(raw);
          if (kind === "label") return isEmpty(raw) ? null : raw.replace(/[^\p{L}\p{N}\s]/gu, "").trim().toLowerCase();
          return raw.toLowerCase();
        };
        // The published rank is the tie-break, so equal keys keep their order.
        const rankOf = (row) =>
          m.rankCol >= 0 ? Number(text(row, m.rankCol)) || 0 : m.rows.indexOf(row);
        m.rows.sort((a, b) => {
          const ka = key(a), kb = key(b);
          // An empty cell always sorts last, whichever direction is chosen.
          if (ka === null && kb === null) return rankOf(a) - rankOf(b);
          if (ka === null) return 1;
          if (kb === null) return -1;
          const cmp = typeof ka === "number" ? ka - kb : String(ka).localeCompare(String(kb));
          return state.desc ? -cmp : cmp || rankOf(a) - rankOf(b);
        });
        for (const row of m.rows) m.table.tBodies[0].appendChild(row);
      }
      if (!state.query) {
        status.textContent = m.isRanking
          ? `All ${m.rows.length} ranked rows.`
          : `All ${m.rows.length} rows.`;
      } else {
        status.textContent = `${shown} of ${m.rows.length} rows shown.`;
      }
    }

    apply();
  });
})();
