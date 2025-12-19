/* school-profile.js
   - Loads JeffCoProjectDataTemplate.csv (assets/projects)
   - Filters rows by SchoolName == selected school (string match with trim)
   - Renders ONE table grouped by SystemCategory
   - Allows sorting (click header) + filtering (search + dropdowns)
   - Does not mutate underlying data
*/

(function () {
  const ASSETS_CSV_PATH = "JeffCoProjectDataTemplate.csv";

  const REQUIRED_COLS = ["SchoolName", "SystemCategory", "AssetType", "ConditionScore"];
  const OPTIONAL_COLS = ["RemainingUsefulLife", "ReplacementCost"];
  const DISPLAY_COLS = ["SystemCategory", "AssetType", "ConditionScore", "RemainingUsefulLife", "ReplacementCost"];

  const elSchoolNameHeader = document.getElementById("schoolNameHeader");
  const elSchoolMeta = document.getElementById("schoolMeta");
  const elSearch = document.getElementById("searchInput");
  const elSystemFilter = document.getElementById("systemCategoryFilter");
  const elAssetFilter = document.getElementById("assetTypeFilter");
  const elClearFilters = document.getElementById("clearFiltersBtn");
  const elTableMount = document.getElementById("tableMount");
  const elDownload = document.getElementById("downloadCsvBtn");

  let allRows = [];
  let schoolRows = [];
  let viewRows = [];
  let sortState = { key: "SystemCategory", dir: "asc" };
  let selectedSchoolNameFromQuery = "";
  let resolvedSchoolName = "";

  function getSchoolFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("school");
    return raw ? raw.toString() : "";
  }

  function norm(s) {
    return (s ?? "").toString().trim();
  }

  // Normalized join key (declarative, no mapping): trim + collapse spaces + case-insensitive
  function normKey(s) {
    return norm(s).replace(/\s+/g, " ").toLowerCase();
  }

  function uniqueSorted(values) {
    const set = new Set();
    (values || []).forEach((v) => {
      const n = norm(v);
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
  }

  function hasAllRequiredColumns(rows) {
    if (!rows || !rows.length) return { ok: true, missing: [] };
    const cols = Object.keys(rows[0] || {});
    const missing = REQUIRED_COLS.filter((c) => !cols.includes(c));
    return { ok: missing.length === 0, missing };
  }

  function parseNumberMaybe(v) {
    if (v === null || v === undefined) return null;
    const s = norm(v);
    if (!s) return null;
    // Allow "$", commas, and parentheses
    const cleaned = s
      .replace(/[\$,]/g, "")
      .replace(/^\((.*)\)$/, "-$1");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function compareValues(a, b, dir) {
    const mult = dir === "desc" ? -1 : 1;
    // numeric compare when both numeric-ish
    const an = parseNumberMaybe(a);
    const bn = parseNumberMaybe(b);
    if (an !== null && bn !== null) return (an - bn) * mult;
    // string compare
    return norm(a).localeCompare(norm(b), undefined, { sensitivity: "base", numeric: true }) * mult;
  }

  function applyFilters() {
    const q = norm(elSearch.value).toLowerCase();
    const systemSel = norm(elSystemFilter.value);
    const assetSel = norm(elAssetFilter.value);

    const filtered = schoolRows.filter((r) => {
      if (systemSel && norm(r.SystemCategory) !== systemSel) return false;
      if (assetSel && norm(r.AssetType) !== assetSel) return false;
      if (q) {
        const hay = DISPLAY_COLS.map((c) => norm(r[c])).join(" | ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Group by SystemCategory; sort within groups
    const grouped = new Map();
    filtered.forEach((r) => {
      const key = norm(r.SystemCategory) || "(Uncategorized)";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    });

    const groupNames = Array.from(grouped.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
    );

    const out = [];
    groupNames.forEach((g) => {
      const rows = grouped.get(g) || [];
      rows.sort((ra, rb) => {
        // keep grouping intact; primary sort inside group
        const key = sortState.key;
        return compareValues(ra[key], rb[key], sortState.dir);
      });
      out.push({ __group: g, __rows: rows });
    });

    viewRows = out;
  }

  function render() {
    elTableMount.innerHTML = "";

    if (!viewRows.length) {
      elTableMount.innerHTML = '<div class="empty">No assets/projects match the current filters.</div>';
      return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");

    DISPLAY_COLS.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col + (sortState.key === col ? (sortState.dir === "asc" ? " ▲" : " ▼") : "");
      th.title = "Sort by " + col;
      th.addEventListener("click", () => {
        if (sortState.key === col) {
          sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
          sortState.key = col;
          sortState.dir = "asc";
        }
        applyFilters();
        render();
      });
      trh.appendChild(th);
    });

    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    viewRows.forEach((g) => {
      const groupTr = document.createElement("tr");
      groupTr.className = "group-row";
      const td = document.createElement("td");
      td.colSpan = DISPLAY_COLS.length;
      td.textContent = g.__group;
      groupTr.appendChild(td);
      tbody.appendChild(groupTr);

      g.__rows.forEach((r) => {
        const tr = document.createElement("tr");
        DISPLAY_COLS.forEach((col) => {
          const cell = document.createElement("td");
          const v = r[col];
          cell.textContent = norm(v) ? norm(v) : "—";
          cell.title = norm(v);
          if ((col === "RemainingUsefulLife" || col === "ReplacementCost") && !norm(v)) {
            cell.className = "muted";
          }
          tr.appendChild(cell);
        });
        tbody.appendChild(tr);
      });
    });

    table.appendChild(tbody);
    elTableMount.appendChild(table);
  }

  function populateFilters() {
    const systems = uniqueSorted(schoolRows.map((r) => r.SystemCategory));
    const assets = uniqueSorted(schoolRows.map((r) => r.AssetType));

    elSystemFilter.innerHTML = '<option value="">All</option>' + systems.map((v) => `<option value="${escapeHtmlAttr(v)}">${escapeHtmlText(v)}</option>`).join("");
    elAssetFilter.innerHTML = '<option value="">All</option>' + assets.map((v) => `<option value="${escapeHtmlAttr(v)}">${escapeHtmlText(v)}</option>`).join("");
  }

  function renderNoMatchChooser(uniqueSchoolNames) {
    const box = document.createElement("div");
    box.className = "empty";
    box.innerHTML =
      `<div style="font-weight:900; color:#111827; margin-bottom:6px;">No assets found for clicked school</div>` +
      `<div class="muted" style="margin-bottom:10px;">` +
      `Clicked SchoolName: <strong>${escapeHtmlText(selectedSchoolNameFromQuery)}</strong><br/>` +
      `This usually means the Step 2 school name text does not exactly match the Assets CSV <code>SchoolName</code> values.` +
      `</div>`;

    const label = document.createElement("label");
    label.className = "muted";
    label.style.display = "block";
    label.style.marginBottom = "6px";
    label.textContent = "Pick the matching SchoolName from the Assets CSV:";

    const select = document.createElement("select");
    select.style.width = "100%";
    select.style.maxWidth = "520px";
    select.style.padding = "8px 10px";
    select.style.border = "1px solid var(--border)";
    select.style.borderRadius = "8px";
    select.style.fontFamily = "inherit";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Select SchoolName —";
    select.appendChild(opt0);

    uniqueSchoolNames.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const v = norm(select.value);
      if (!v) return;
      resolvedSchoolName = v;
      schoolRows = allRows.filter((r) => normKey(r.SchoolName) === normKey(resolvedSchoolName));
      elSchoolMeta.textContent =
        `CSV rows: ${allRows.length.toLocaleString()} • ` +
        `Resolved SchoolName="${resolvedSchoolName}" • ` +
        `Rows: ${schoolRows.length.toLocaleString()}`;

      populateFilters();
      applyFilters();
      render();
    });

    box.appendChild(label);
    box.appendChild(select);
    elTableMount.innerHTML = "";
    elTableMount.appendChild(box);
  }

  function escapeHtmlText(s) {
    return norm(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeHtmlAttr(s) {
    return escapeHtmlText(s).replace(/"/g, "&quot;");
  }

  function downloadFilteredCsv() {
    // Flatten viewRows into rows with DISPLAY_COLS only
    const flat = [];
    viewRows.forEach((g) => {
      (g.__rows || []).forEach((r) => {
        const out = {};
        DISPLAY_COLS.forEach((c) => (out[c] = r[c] ?? ""));
        flat.push(out);
      });
    });

    const csv = Papa.unparse(flat, { quotes: true });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const safeName = norm(elSchoolNameHeader.textContent || "school").replace(/[^\w\- ]+/g, "").trim() || "school";
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}-assets.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  function init() {
    const school = getSchoolFromQuery();
    selectedSchoolNameFromQuery = school ? school : "";
    elSchoolNameHeader.textContent = selectedSchoolNameFromQuery ? selectedSchoolNameFromQuery : "—";

    if (!school) {
      elSchoolMeta.textContent = "No school selected. Open this page from the Step 2 school list.";
      elTableMount.innerHTML = '<div class="empty">Missing query parameter <span class="muted">?school=</span>.</div>';
      elDownload.disabled = true;
      return;
    }

    elSchoolMeta.textContent = `Loading assets/projects from ${ASSETS_CSV_PATH}…`;

    Papa.parse(ASSETS_CSV_PATH, {
      header: true,
      skipEmptyLines: true,
      download: true,
      complete: function (results) {
        allRows = Array.isArray(results.data) ? results.data : [];

        const colCheck = hasAllRequiredColumns(allRows);
        if (!colCheck.ok) {
          elSchoolMeta.textContent = `CSV is missing required columns: ${colCheck.missing.join(", ")}`;
          elTableMount.innerHTML = '<div class="empty">Cannot render profile due to missing required columns.</div>';
          elDownload.disabled = true;
          return;
        }

        const uniqueSchoolNames = uniqueSorted(allRows.map((r) => r.SchoolName));

        // Filter by SchoolName
        // 1) Exact (trim) match
        // 2) Normalized match (trim + collapse spaces + case-insensitive)
        const target = norm(school);
        const targetKey = normKey(target);
        const exact = allRows.filter((r) => norm(r.SchoolName) === target);
        const normalized = exact.length
          ? exact
          : allRows.filter((r) => normKey(r.SchoolName) === targetKey);

        schoolRows = normalized;
        resolvedSchoolName = schoolRows.length ? (schoolRows[0] ? norm(schoolRows[0].SchoolName) : target) : "";

        elSchoolMeta.textContent =
          `CSV rows: ${allRows.length.toLocaleString()} • ` +
          `Clicked SchoolName="${target}" • ` +
          (resolvedSchoolName ? `Resolved SchoolName="${resolvedSchoolName}" • ` : "") +
          `Rows: ${schoolRows.length.toLocaleString()}`;

        if (!schoolRows.length) {
          renderNoMatchChooser(uniqueSchoolNames);
          elDownload.disabled = true;
          return;
        }

        populateFilters();
        applyFilters();
        render();
        elDownload.disabled = false;
      },
      error: function (err) {
        console.error("Failed to load assets CSV:", err);
        elSchoolMeta.textContent = "Failed to load assets/projects CSV.";
        elTableMount.innerHTML = '<div class="empty">Could not load the CSV file.</div>';
        elDownload.disabled = true;
      },
    });

    elSearch.addEventListener("input", () => {
      applyFilters();
      render();
    });
    elSystemFilter.addEventListener("change", () => {
      applyFilters();
      render();
    });
    elAssetFilter.addEventListener("change", () => {
      applyFilters();
      render();
    });
    elClearFilters.addEventListener("click", () => {
      elSearch.value = "";
      elSystemFilter.value = "";
      elAssetFilter.value = "";
      sortState = { key: "SystemCategory", dir: "asc" };
      applyFilters();
      render();
    });
    elDownload.addEventListener("click", downloadFilteredCsv);
  }

  document.addEventListener("DOMContentLoaded", init);
})();


