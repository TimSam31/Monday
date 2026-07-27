(function () {
  "use strict";

  var STORAGE_KEY = "mandarinWordList.entries";

  var TONE_MARKS = {
    a: ["a", "ā", "á", "ǎ", "à"],
    e: ["e", "ē", "é", "ě", "è"],
    i: ["i", "ī", "í", "ǐ", "ì"],
    o: ["o", "ō", "ó", "ǒ", "ò"],
    u: ["u", "ū", "ú", "ǔ", "ù"],
    "ü": ["ü", "ǖ", "ǘ", "ǚ", "ǜ"]
  };

  // Converts one numeric-tone syllable (e.g. "ni3", "lv3", "hao3") into
  // its diacritic form (e.g. "nǐ", "lǔ", "hǎo"). Tokens that
  // don't match "letters + digit 1-5" are returned unchanged, so already
  // pasted diacritics or plain text pass through untouched.
  function convertSyllable(token) {
    var match = token.match(/^([a-zA-ZüÜvV:]+)([1-5])$/);
    if (!match) return token;

    var letters = match[1];
    var tone = parseInt(match[2], 10);
    var base = letters.replace(/v/g, "ü").replace(/V/g, "Ü").replace(/:/g, "");

    if (tone === 5) return base;

    var lower = base.toLowerCase();
    var vowelIndex = -1;

    if (lower.indexOf("a") !== -1) {
      vowelIndex = lower.indexOf("a");
    } else if (lower.indexOf("e") !== -1) {
      vowelIndex = lower.indexOf("e");
    } else if (lower.indexOf("ou") !== -1) {
      vowelIndex = lower.indexOf("o");
    } else {
      for (var i = lower.length - 1; i >= 0; i--) {
        if ("iouü".indexOf(lower[i]) !== -1) {
          vowelIndex = i;
          break;
        }
      }
    }

    if (vowelIndex === -1) return base;

    var vowelChar = base[vowelIndex];
    var isUpper = vowelChar !== vowelChar.toLowerCase();
    var marks = TONE_MARKS[vowelChar.toLowerCase()];
    if (!marks) return base;

    var marked = marks[tone];
    if (isUpper) marked = marked.toUpperCase();

    return base.slice(0, vowelIndex) + marked + base.slice(vowelIndex + 1);
  }

  function convertPinyin(text) {
    return text
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(convertSyllable)
      .join(" ");
  }

  // ---- storage ----

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  var entries = loadEntries();

  // ---- rendering ----

  var tableBody = document.getElementById("word-table-body");
  var emptyState = document.getElementById("empty-state");
  var entryCount = document.getElementById("entry-count");
  var filterInput = document.getElementById("filter-input");

  function formatDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function render() {
    var query = filterInput.value.trim().toLowerCase();
    var visible = entries.filter(function (e) {
      if (!query) return true;
      return (
        e.hanzi.toLowerCase().indexOf(query) !== -1 ||
        e.pinyin.toLowerCase().indexOf(query) !== -1 ||
        e.meaning.toLowerCase().indexOf(query) !== -1
      );
    });

    tableBody.innerHTML = "";
    visible
      .slice()
      .reverse()
      .forEach(function (entry) {
        var tr = document.createElement("tr");

        var hanziTd = document.createElement("td");
        hanziTd.className = "hanzi";
        hanziTd.textContent = entry.hanzi;

        var pinyinTd = document.createElement("td");
        pinyinTd.className = "pinyin";
        pinyinTd.textContent = entry.pinyin;

        var meaningTd = document.createElement("td");
        meaningTd.textContent = entry.meaning;

        var dateTd = document.createElement("td");
        dateTd.className = "date";
        dateTd.textContent = formatDate(entry.createdAt);

        var actionTd = document.createElement("td");
        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "×";
        deleteBtn.setAttribute("aria-label", "Delete entry " + entry.hanzi);
        deleteBtn.addEventListener("click", function () {
          entries = entries.filter(function (e) { return e.id !== entry.id; });
          saveEntries(entries);
          render();
        });
        actionTd.appendChild(deleteBtn);

        tr.appendChild(hanziTd);
        tr.appendChild(pinyinTd);
        tr.appendChild(meaningTd);
        tr.appendChild(dateTd);
        tr.appendChild(actionTd);
        tableBody.appendChild(tr);
      });

    entryCount.textContent = entries.length;
    emptyState.style.display = entries.length === 0 ? "block" : "none";
    document.getElementById("word-table").style.display = entries.length === 0 ? "none" : "table";
  }

  // ---- add entry form ----

  var form = document.getElementById("word-form");
  var pinyinInput = document.getElementById("pinyin-input");
  var pinyinPreview = document.getElementById("pinyin-preview");
  var hanziInput = document.getElementById("hanzi-input");
  var meaningInput = document.getElementById("meaning-input");
  var formError = document.getElementById("form-error");
  var candidatesPanel = document.getElementById("candidates-panel");

  // Pinyin -> [[hanzi, definition], ...] lookup, loaded from data/pinyin-hanzi.js.
  var PINYIN_HANZI_DATA = window.PINYIN_HANZI_DATA || {};

  // The syllable currently being typed: the last whitespace-separated token,
  // as long as the caret hasn't moved past it with a trailing space.
  function currentSyllableToken() {
    var value = pinyinInput.value;
    if (value === "" || /\s$/.test(value)) return "";
    var tokens = value.trim().split(/\s+/);
    return tokens[tokens.length - 1];
  }

  function clearCandidates() {
    candidatesPanel.innerHTML = "";
  }

  function renderCandidates() {
    clearCandidates();
    var token = currentSyllableToken();
    if (!/[1-5]$/.test(token)) return; // only once the tone number is typed

    var converted = convertSyllable(token);
    var candidates = PINYIN_HANZI_DATA[converted];
    if (!candidates || !candidates.length) return;

    candidates.forEach(function (pair) {
      var hanzi = pair[0];
      var definition = pair[1];

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "candidate-btn";
      btn.title = definition;

      var charSpan = document.createElement("span");
      charSpan.className = "cb-char";
      charSpan.textContent = hanzi;

      var defSpan = document.createElement("span");
      defSpan.className = "cb-def";
      defSpan.textContent = definition;

      btn.appendChild(charSpan);
      btn.appendChild(defSpan);

      btn.addEventListener("click", function () {
        hanziInput.value += hanzi;
        // commit the syllable (numeral -> diacritic) and start the next one
        pinyinInput.value = pinyinInput.value.replace(/\S+$/, converted) + " ";
        pinyinPreview.textContent = convertPinyin(pinyinInput.value) || " ";
        clearCandidates();
        pinyinInput.focus();
      });

      candidatesPanel.appendChild(btn);
    });
  }

  pinyinInput.addEventListener("input", function () {
    var converted = convertPinyin(pinyinInput.value);
    pinyinPreview.textContent = converted || " ";
    renderCandidates();
  });

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    formError.textContent = "";

    var hanzi = hanziInput.value.trim();
    var pinyinRaw = pinyinInput.value.trim();
    var meaning = meaningInput.value.trim();

    if (!hanzi || !pinyinRaw || !meaning) {
      formError.textContent = "Hanzi, pinyin, and meaning are all required.";
      return;
    }

    var pinyin = convertPinyin(pinyinRaw);

    entries.push({
      id: makeId(),
      hanzi: hanzi,
      pinyin: pinyin,
      meaning: meaning,
      createdAt: new Date().toISOString()
    });

    saveEntries(entries);
    render();

    form.reset();
    pinyinPreview.textContent = " ";
    clearCandidates();
    hanziInput.focus();
  });

  filterInput.addEventListener("input", render);

  // ---- export ----

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById("export-json-btn").addEventListener("click", function () {
    download("mandarin-word-list.json", JSON.stringify(entries, null, 2), "application/json");
  });

  function csvEscape(value) {
    var str = String(value == null ? "" : value);
    if (/[",\n]/.test(str)) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  document.getElementById("export-csv-btn").addEventListener("click", function () {
    var rows = [["hanzi", "pinyin", "meaning", "createdAt"]];
    entries.forEach(function (e) {
      rows.push([e.hanzi, e.pinyin, e.meaning, e.createdAt]);
    });
    var csv = rows.map(function (row) { return row.map(csvEscape).join(","); }).join("\n");
    download("mandarin-word-list.csv", csv, "text/csv");
  });

  // ---- import ----

  var ioStatus = document.getElementById("io-status");

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(function (r) { return r.length > 1 || r[0] !== ""; });
  }

  function entryKey(e) {
    return e.hanzi + "" + e.pinyin + "" + e.meaning;
  }

  function mergeEntries(newOnes) {
    var existingKeys = {};
    entries.forEach(function (e) { existingKeys[entryKey(e)] = true; });

    var added = 0;
    newOnes.forEach(function (raw) {
      var hanzi = (raw.hanzi || "").trim();
      var pinyin = (raw.pinyin || "").trim();
      var meaning = (raw.meaning || "").trim();
      if (!hanzi || !pinyin || !meaning) return;

      var candidate = { hanzi: hanzi, pinyin: pinyin, meaning: meaning };
      var key = entryKey(candidate);
      if (existingKeys[key]) return;
      existingKeys[key] = true;

      entries.push({
        id: makeId(),
        hanzi: hanzi,
        pinyin: pinyin,
        meaning: meaning,
        createdAt: raw.createdAt || new Date().toISOString()
      });
      added++;
    });
    return added;
  }

  document.getElementById("import-input").addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result);
      var added = 0;
      try {
        if (/\.json$/i.test(file.name)) {
          var parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) throw new Error("JSON must be an array of entries.");
          added = mergeEntries(parsed);
        } else {
          var rows = parseCsv(text);
          if (!rows.length) throw new Error("CSV file is empty.");
          var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
          var hIdx = header.indexOf("hanzi");
          var pIdx = header.indexOf("pinyin");
          var mIdx = header.indexOf("meaning");
          if (hIdx === -1 || pIdx === -1 || mIdx === -1) {
            throw new Error("CSV header must include hanzi, pinyin, meaning columns.");
          }
          var objs = rows.slice(1).map(function (r) {
            return { hanzi: r[hIdx], pinyin: r[pIdx], meaning: r[mIdx] };
          });
          added = mergeEntries(objs);
        }
        saveEntries(entries);
        render();
        ioStatus.textContent = "Imported " + added + " new entr" + (added === 1 ? "y" : "ies") + ".";
      } catch (err) {
        ioStatus.textContent = "Import failed: " + err.message;
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  });

  render();
})();
