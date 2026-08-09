(function () {
  "use strict";

  var STORAGE_KEY = "mandarinWordList.entries";
  var PHRASES_STORAGE_KEY = "mandarinWordList.phrases";
  var CJK_RE = /[一-鿿]/;

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

  function containsCjk(text) {
    return CJK_RE.test(text || "");
  }

  // Strips tone marks (and ü's umlaut) so pinyin search/filter can match
  // plain-typed queries like "hao" against stored diacritic pinyin "hǎo".
  function stripDiacritics(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Splits a candidate's English definition (e.g. "good, excellent, fine;
  // proper, suitable; well") into individual tag-sized fragments.
  function splitDefinitionIntoTags(definition) {
    return (definition || "")
      .split(/[,;]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function csvEscape(value) {
    var str = String(value == null ? "" : value);
    if (/[",\n]/.test(str)) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

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

  // ---- words storage ----

  // Meaning is stored as an array of tags. Accepts a legacy single-string
  // meaning (from data saved before tags existed) and wraps it as one tag.
  function normalizeMeaning(raw) {
    if (Array.isArray(raw)) {
      return raw.map(function (t) { return String(t).trim(); }).filter(Boolean);
    }
    if (typeof raw === "string" && raw.trim()) {
      return [raw.trim()];
    }
    return [];
  }

  function normalizeEntry(e) {
    return {
      id: e.id || makeId(),
      hanzi: e.hanzi,
      pinyin: e.pinyin,
      meaning: normalizeMeaning(e.meaning),
      createdAt: e.createdAt || new Date().toISOString()
    };
  }

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeEntry) : [];
    } catch (e) {
      return [];
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  var entries = loadEntries();

  // ---- phrases storage ----

  // Phrase meaning is a single plain string (Latin alphabet), display-only.
  // Tags are never stored -- they're derived from the current word list
  // every time a phrase is rendered, so editing/deleting a word instantly
  // updates every phrase's tags with nothing to keep in sync.
  function normalizePhrase(p) {
    return {
      id: p.id || makeId(),
      hanzi: p.hanzi,
      pinyin: p.pinyin || "",
      meaning: typeof p.meaning === "string" ? p.meaning.trim() : "",
      createdAt: p.createdAt || new Date().toISOString()
    };
  }

  function loadPhrases() {
    try {
      var raw = localStorage.getItem(PHRASES_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizePhrase) : [];
    } catch (e) {
      return [];
    }
  }

  function savePhrases(phrases) {
    localStorage.setItem(PHRASES_STORAGE_KEY, JSON.stringify(phrases));
  }

  var phrases = loadPhrases();

  // ---- pinyin candidate data + reverse lookup ----

  // Pinyin -> [[hanzi, definition], ...] lookup, loaded from data/pinyin-hanzi.js.
  var PINYIN_HANZI_DATA = window.PINYIN_HANZI_DATA || {};

  // hanzi -> a single best-guess pinyin reading, inverted from the above.
  // Used only as a last-resort fallback when auto-filling pinyin for a
  // pasted phrase; a saved word's own pinyin is always preferred when a
  // character run matches one.
  var HANZI_TO_PINYIN = (function () {
    var map = {};
    Object.keys(PINYIN_HANZI_DATA).forEach(function (py) {
      PINYIN_HANZI_DATA[py].forEach(function (pair) {
        var ch = pair[0];
        if (!(ch in map)) map[ch] = py;
      });
    });
    return map;
  })();

  // ---- word/phrase matching + derived tags ----

  function matchWordsInPhrase(phraseHanzi, wordList) {
    if (!phraseHanzi) return [];
    return wordList.filter(function (w) {
      return w.hanzi && phraseHanzi.indexOf(w.hanzi) !== -1;
    });
  }

  function derivePhraseTags(phraseHanzi, wordList) {
    var matched = matchWordsInPhrase(phraseHanzi, wordList);
    var seen = {};
    var tags = [];
    matched.forEach(function (w) {
      w.meaning.forEach(function (t) {
        var key = t.toLowerCase();
        if (!seen[key]) {
          seen[key] = true;
          tags.push(t);
        }
      });
    });
    return { matchedWords: matched, tags: tags };
  }

  // Ranks phrases containing `word` by how much the *rest* of the phrase's
  // vocabulary echoes that word's own tags (a rough relevance signal),
  // tie-broken by most recently added.
  function topPhrasesForWord(word, phraseList, wordList, limit) {
    var scored = [];
    phraseList.forEach(function (p) {
      var info = derivePhraseTags(p.hanzi, wordList);
      var containsWord = info.matchedWords.some(function (w) { return w.id === word.id; });
      if (!containsWord) return;

      var otherTags = {};
      info.matchedWords.forEach(function (w) {
        if (w.id === word.id) return;
        w.meaning.forEach(function (t) { otherTags[t.toLowerCase()] = true; });
      });
      var score = word.meaning.reduce(function (acc, t) {
        return acc + (otherTags[t.toLowerCase()] ? 1 : 0);
      }, 0);

      scored.push({ phrase: p, score: score, tags: info.tags });
    });

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.phrase.createdAt) - new Date(a.phrase.createdAt);
    });

    return scored.slice(0, limit || 2);
  }

  // Best-effort pinyin for a hanzi string with no pinyin of its own: scan
  // left to right, preferring the longest run that matches a saved word's
  // exact hanzi (so we reuse its known-correct pinyin), falling back to the
  // single most common reading per character for anything else.
  function autoFillPinyinForHanzi(hanziText, wordList) {
    var chars = Array.from(hanziText);
    var byLength = wordList
      .filter(function (w) { return w.hanzi; })
      .slice()
      .sort(function (a, b) { return Array.from(b.hanzi).length - Array.from(a.hanzi).length; });
    var maxWordLen = byLength.length ? Array.from(byLength[0].hanzi).length : 0;

    var result = [];
    var i = 0;
    while (i < chars.length) {
      var matchedWord = null;
      for (var len = Math.min(maxWordLen, chars.length - i); len >= 1; len--) {
        var candidate = chars.slice(i, i + len).join("");
        var found = byLength.find(function (w) { return w.hanzi === candidate; });
        if (found) { matchedWord = found; break; }
      }
      if (matchedWord) {
        result.push(matchedWord.pinyin);
        i += Array.from(matchedWord.hanzi).length;
      } else {
        result.push(HANZI_TO_PINYIN[chars[i]] || "?");
        i += 1;
      }
    }
    return result.join(" ");
  }

  // ---- shared pagination ----

  var PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

  function clampPage(page, pageCount) {
    return Math.min(Math.max(1, page), Math.max(1, pageCount));
  }

  function paginate(items, state) {
    var start = (state.page - 1) * state.pageSize;
    return items.slice(start, start + state.pageSize);
  }

  function renderPaginationControls(container, state, totalItems, onChange) {
    container.innerHTML = "";
    var pageCount = Math.max(1, Math.ceil(totalItems / state.pageSize));
    state.page = clampPage(state.page, pageCount);

    var sizeGroup = document.createElement("div");
    sizeGroup.className = "page-size-group";
    var label = document.createElement("label");
    label.textContent = "Show";
    var select = document.createElement("select");
    select.setAttribute("aria-label", "Items per page");
    PAGE_SIZE_OPTIONS.forEach(function (size) {
      var opt = document.createElement("option");
      opt.value = String(size);
      opt.textContent = String(size);
      if (size === state.pageSize) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", function () {
      state.pageSize = parseInt(select.value, 10);
      state.page = 1;
      onChange();
    });
    sizeGroup.appendChild(label);
    sizeGroup.appendChild(select);

    var nav = document.createElement("div");
    nav.className = "page-nav";

    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "Prev";
    prevBtn.disabled = state.page <= 1;
    prevBtn.addEventListener("click", function () { state.page -= 1; onChange(); });

    var indicator = document.createElement("span");
    indicator.textContent = "Page " + state.page + " of " + pageCount;

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "Next";
    nextBtn.disabled = state.page >= pageCount;
    nextBtn.addEventListener("click", function () { state.page += 1; onChange(); });

    nav.appendChild(prevBtn);
    nav.appendChild(indicator);
    nav.appendChild(nextBtn);

    if (totalItems > 0) {
      container.appendChild(sizeGroup);
      container.appendChild(nav);
    }
  }

  // ---- word browse table ----

  var wordTable = document.getElementById("word-table");
  var wordTableBody = document.getElementById("word-table-body");
  var wordEmptyState = document.getElementById("word-empty-state");
  var wordCountLabel = document.getElementById("word-count-label");
  var wordFilterInput = document.getElementById("word-filter-input");
  var wordPagination = document.getElementById("word-pagination");
  var wordPageState = { page: 1, pageSize: 20 };

  // ---- inline editing (word tags / phrase meaning) ----
  //
  // A word or phrase can be "opened" for editing from either the browse
  // table or a search result card -- both read the same editingWordId /
  // editingPhraseId, so there's only ever one item of each type being
  // edited at a time, wherever it's rendered.

  var editingWordId = null;
  var editingPhraseId = null;

  function buildEditTrigger(onClick, ariaLabel) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "edit-btn";
    btn.textContent = "Edit";
    if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
    btn.addEventListener("click", onClick);
    return btn;
  }

  // Editable tag-chip control for a word's meaning tags, reused by the
  // Words browse table and word search-result cards. Edits a working copy
  // until Save, so Cancel discards cleanly.
  function buildWordTagsEditor(word) {
    var wrapper = document.createElement("div");
    wrapper.className = "inline-editor";

    var tagBox = document.createElement("div");
    tagBox.className = "tag-input";

    var workingTags = word.meaning.slice();
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "add tag";

    function renderChips() {
      Array.prototype.slice.call(tagBox.querySelectorAll(".tag-chip")).forEach(function (el) { el.remove(); });
      workingTags.forEach(function (tag, index) {
        var chip = document.createElement("span");
        chip.className = "tag-chip";
        var text = document.createElement("span");
        text.textContent = tag;
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "tag-remove";
        removeBtn.textContent = "×";
        removeBtn.setAttribute("aria-label", "Remove tag " + tag);
        removeBtn.addEventListener("click", function () {
          workingTags.splice(index, 1);
          renderChips();
        });
        chip.appendChild(text);
        chip.appendChild(removeBtn);
        tagBox.insertBefore(chip, input);
      });
    }

    function commitTypedTag() {
      var tag = input.value.trim();
      input.value = "";
      if (!tag) return;
      var exists = workingTags.some(function (t) { return t.toLowerCase() === tag.toLowerCase(); });
      if (!exists) workingTags.push(tag);
      renderChips();
    }

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        commitTypedTag();
      } else if (event.key === "Backspace" && input.value === "" && workingTags.length) {
        workingTags.pop();
        renderChips();
      }
    });

    tagBox.appendChild(input);
    renderChips();

    var error = document.createElement("span");
    error.className = "error";

    var actions = document.createElement("div");
    actions.className = "inline-edit-actions";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", function () {
      commitTypedTag();
      if (workingTags.length === 0) {
        error.textContent = "At least one tag is required.";
        return;
      }
      word.meaning = workingTags;
      editingWordId = null;
      persistEntries();
      renderAll();
    });

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", function () {
      editingWordId = null;
      renderAll();
    });

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    wrapper.appendChild(tagBox);
    wrapper.appendChild(actions);
    wrapper.appendChild(error);
    return wrapper;
  }

  // Editable plain-text control for a phrase's meaning, reused by the
  // Phrases browse table and phrase search-result cards. Tags are never
  // editable here since they're always derived from the word list.
  function buildPhraseMeaningEditor(phrase) {
    var wrapper = document.createElement("div");
    wrapper.className = "inline-editor";

    var input = document.createElement("input");
    input.type = "text";
    input.className = "inline-meaning-input";
    input.value = phrase.meaning;
    input.placeholder = "meaning";

    var actions = document.createElement("div");
    actions.className = "inline-edit-actions";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", function () {
      phrase.meaning = input.value.trim();
      editingPhraseId = null;
      persistEntries();
      renderAll();
    });

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", function () {
      editingPhraseId = null;
      renderAll();
    });

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    wrapper.appendChild(input);
    wrapper.appendChild(actions);
    return wrapper;
  }

  function renderWordTable() {
    var query = wordFilterInput.value.trim().toLowerCase();
    var queryPlain = stripDiacritics(query);
    var filtered = entries.filter(function (e) {
      if (!query) return true;
      return (
        e.hanzi.toLowerCase().indexOf(query) !== -1 ||
        stripDiacritics(e.pinyin.toLowerCase()).indexOf(queryPlain) !== -1 ||
        e.meaning.some(function (tag) { return tag.toLowerCase().indexOf(query) !== -1; })
      );
    });

    var sorted = filtered.slice().reverse();
    var pageItems = paginate(sorted, wordPageState);

    wordTableBody.innerHTML = "";
    pageItems.forEach(function (entry) {
      var tr = document.createElement("tr");

      var hanziTd = document.createElement("td");
      hanziTd.className = "hanzi";
      hanziTd.textContent = entry.hanzi;

      var pinyinTd = document.createElement("td");
      pinyinTd.className = "pinyin";
      pinyinTd.textContent = entry.pinyin;

      var meaningTd = document.createElement("td");
      meaningTd.className = "meaning-cell";
      var isEditingWord = editingWordId === entry.id;
      if (isEditingWord) {
        meaningTd.appendChild(buildWordTagsEditor(entry));
      } else {
        entry.meaning.forEach(function (tag) {
          var pill = document.createElement("span");
          pill.className = "meaning-pill";
          pill.textContent = tag;
          meaningTd.appendChild(pill);
        });
      }

      var dateTd = document.createElement("td");
      dateTd.className = "date";
      dateTd.textContent = formatDate(entry.createdAt);

      var actionTd = document.createElement("td");
      if (!isEditingWord) {
        actionTd.appendChild(buildEditTrigger(function () {
          editingWordId = entry.id;
          renderAll();
        }, "Edit tags for " + entry.hanzi));

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "×";
        deleteBtn.setAttribute("aria-label", "Delete entry " + entry.hanzi);
        deleteBtn.addEventListener("click", function () {
          entries = entries.filter(function (e) { return e.id !== entry.id; });
          persistEntries();
          renderAll();
        });
        actionTd.appendChild(deleteBtn);
      }

      tr.appendChild(hanziTd);
      tr.appendChild(pinyinTd);
      tr.appendChild(meaningTd);
      tr.appendChild(dateTd);
      tr.appendChild(actionTd);
      wordTableBody.appendChild(tr);
    });

    wordCountLabel.textContent = entries.length + (entries.length === 1 ? " word" : " words");
    wordEmptyState.style.display = entries.length === 0 ? "block" : "none";
    wordTable.style.display = entries.length === 0 ? "none" : "table";
    renderPaginationControls(wordPagination, wordPageState, filtered.length, renderWordTable);
  }

  wordFilterInput.addEventListener("input", function () {
    wordPageState.page = 1;
    renderWordTable();
  });

  // ---- phrase browse table ----

  var phraseTable = document.getElementById("phrase-table");
  var phraseTableBody = document.getElementById("phrase-table-body");
  var phraseEmptyState = document.getElementById("phrase-empty-state");
  var phraseCountLabel = document.getElementById("phrase-count-label");
  var phraseFilterInput = document.getElementById("phrase-filter-input");
  var phrasePagination = document.getElementById("phrase-pagination");
  var phrasePageState = { page: 1, pageSize: 20 };

  function renderPhraseTable() {
    var query = phraseFilterInput.value.trim().toLowerCase();
    var filtered = phrases.filter(function (p) {
      if (!query) return true;
      var info = derivePhraseTags(p.hanzi, entries);
      return (
        p.hanzi.toLowerCase().indexOf(query) !== -1 ||
        (p.meaning || "").toLowerCase().indexOf(query) !== -1 ||
        info.tags.some(function (t) { return t.toLowerCase().indexOf(query) !== -1; })
      );
    });

    var sorted = filtered.slice().reverse();
    var pageItems = paginate(sorted, phrasePageState);

    phraseTableBody.innerHTML = "";
    pageItems.forEach(function (phrase) {
      var info = derivePhraseTags(phrase.hanzi, entries);
      var tr = document.createElement("tr");

      var hanziTd = document.createElement("td");
      hanziTd.className = "hanzi";
      hanziTd.textContent = phrase.hanzi;

      var pinyinTd = document.createElement("td");
      pinyinTd.className = "pinyin";
      pinyinTd.textContent = phrase.pinyin;

      var isEditingPhrase = editingPhraseId === phrase.id;
      var meaningTd = document.createElement("td");
      if (isEditingPhrase) {
        meaningTd.appendChild(buildPhraseMeaningEditor(phrase));
      } else {
        meaningTd.className = "phrase-meaning-cell";
        meaningTd.textContent = phrase.meaning;
      }

      var tagsTd = document.createElement("td");
      tagsTd.className = "meaning-cell";
      info.tags.forEach(function (tag) {
        var pill = document.createElement("span");
        pill.className = "meaning-pill";
        pill.textContent = tag;
        tagsTd.appendChild(pill);
      });

      var dateTd = document.createElement("td");
      dateTd.className = "date";
      dateTd.textContent = formatDate(phrase.createdAt);

      var actionTd = document.createElement("td");
      if (!isEditingPhrase) {
        actionTd.appendChild(buildEditTrigger(function () {
          editingPhraseId = phrase.id;
          renderAll();
        }, "Edit meaning for " + phrase.hanzi));

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "×";
        deleteBtn.setAttribute("aria-label", "Delete phrase " + phrase.hanzi);
        deleteBtn.addEventListener("click", function () {
          phrases = phrases.filter(function (p) { return p.id !== phrase.id; });
          persistEntries();
          renderAll();
        });
        actionTd.appendChild(deleteBtn);
      }

      tr.appendChild(hanziTd);
      tr.appendChild(pinyinTd);
      tr.appendChild(meaningTd);
      tr.appendChild(tagsTd);
      tr.appendChild(dateTd);
      tr.appendChild(actionTd);
      phraseTableBody.appendChild(tr);
    });

    phraseCountLabel.textContent = phrases.length + (phrases.length === 1 ? " phrase" : " phrases");
    phraseEmptyState.style.display = phrases.length === 0 ? "block" : "none";
    phraseTable.style.display = phrases.length === 0 ? "none" : "table";
    renderPaginationControls(phrasePagination, phrasePageState, filtered.length, renderPhraseTable);
  }

  phraseFilterInput.addEventListener("input", function () {
    phrasePageState.page = 1;
    renderPhraseTable();
  });

  // ---- tabs ----

  function wireTabs(wordsBtn, phrasesBtn, wordsPanel, phrasesPanel, onSelect) {
    function select(isWords) {
      wordsBtn.classList.toggle("is-active", isWords);
      wordsBtn.setAttribute("aria-selected", String(isWords));
      phrasesBtn.classList.toggle("is-active", !isWords);
      phrasesBtn.setAttribute("aria-selected", String(!isWords));
      wordsPanel.hidden = !isWords;
      phrasesPanel.hidden = isWords;
      if (onSelect) onSelect(isWords ? "words" : "phrases");
    }
    wordsBtn.addEventListener("click", function () { select(true); });
    phrasesBtn.addEventListener("click", function () { select(false); });
  }

  wireTabs(
    document.getElementById("input-tab-words"),
    document.getElementById("input-tab-phrases"),
    document.getElementById("input-panel-words"),
    document.getElementById("input-panel-phrases")
  );

  wireTabs(
    document.getElementById("browse-tab-words"),
    document.getElementById("browse-tab-phrases"),
    document.getElementById("browse-panel-words"),
    document.getElementById("browse-panel-phrases")
  );

  // ---- word entry form ----

  var form = document.getElementById("word-form");
  var pinyinInput = document.getElementById("pinyin-input");
  var pinyinPreview = document.getElementById("pinyin-preview");
  var hanziInput = document.getElementById("hanzi-input");
  var meaningInput = document.getElementById("meaning-input");
  var meaningTagContainer = document.getElementById("meaning-tag-input");
  var formError = document.getElementById("form-error");
  var candidatesPanel = document.getElementById("candidates-panel");

  // ---- meaning tags (word form) ----

  var meaningTags = [];

  function renderMeaningTags() {
    Array.prototype.slice
      .call(meaningTagContainer.querySelectorAll(".tag-chip"))
      .forEach(function (el) { el.remove(); });

    meaningTags.forEach(function (tag, index) {
      var chip = document.createElement("span");
      chip.className = "tag-chip";

      var text = document.createElement("span");
      text.textContent = tag;

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "tag-remove";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", "Remove tag " + tag);
      removeBtn.addEventListener("click", function () {
        meaningTags.splice(index, 1);
        renderMeaningTags();
      });

      chip.appendChild(text);
      chip.appendChild(removeBtn);
      meaningTagContainer.insertBefore(chip, meaningInput);
    });
  }

  function addMeaningTag(raw) {
    var tag = raw.trim();
    meaningInput.value = "";
    if (!tag) return;
    var exists = meaningTags.some(function (t) { return t.toLowerCase() === tag.toLowerCase(); });
    if (!exists) meaningTags.push(tag);
    renderMeaningTags();
  }

  function resetMeaningTags() {
    meaningTags = [];
    meaningInput.value = "";
    renderMeaningTags();
  }

  meaningInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addMeaningTag(meaningInput.value);
    } else if (event.key === "Backspace" && meaningInput.value === "" && meaningTags.length) {
      meaningTags.pop();
      renderMeaningTags();
    }
  });

  meaningInput.addEventListener("blur", function () {
    if (meaningInput.value.trim()) addMeaningTag(meaningInput.value);
  });

  // The syllable currently being typed: the last whitespace-separated token,
  // as long as the caret hasn't moved past it with a trailing space.
  function lastSyllableToken(inputEl) {
    var value = inputEl.value;
    if (value === "" || /\s$/.test(value)) return "";
    var tokens = value.trim().split(/\s+/);
    return tokens[tokens.length - 1];
  }

  function clearCandidates() {
    candidatesPanel.innerHTML = "";
  }

  function renderCandidates() {
    clearCandidates();
    var token = lastSyllableToken(pinyinInput);
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
        // Pre-fill meaning tags from the candidate's dictionary definition;
        // the user can still remove any of them before saving the word.
        splitDefinitionIntoTags(definition).forEach(addMeaningTag);
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

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    formError.textContent = "";

    var hanzi = hanziInput.value.trim();
    var pinyinRaw = pinyinInput.value.trim();
    if (meaningInput.value.trim()) addMeaningTag(meaningInput.value);
    var meaning = meaningTags.slice();

    if (!hanzi || !pinyinRaw || meaning.length === 0) {
      formError.textContent = "Hanzi, pinyin, and at least one meaning tag are all required.";
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

    persistEntries();
    renderAll();

    form.reset();
    pinyinPreview.textContent = " ";
    clearCandidates();
    resetMeaningTags();
    hanziInput.focus();
  });

  // ---- phrase entry form ----

  var phraseForm = document.getElementById("phrase-form");
  var phraseInput = document.getElementById("phrase-input");
  var phraseHanziPreview = document.getElementById("phrase-hanzi-preview");
  var phraseCandidatesPanel = document.getElementById("phrase-candidates-panel");
  var phrasePinyinInput = document.getElementById("phrase-pinyin-input");
  var phraseMeaningInput = document.getElementById("phrase-meaning-input");
  var phraseTagsPreview = document.getElementById("phrase-tags-preview");
  var phraseFormError = document.getElementById("phrase-form-error");

  var phraseHanziBuffer = ""; // accumulated via candidate clicks, pinyin-typing mode only

  function phraseInputHasCjk() {
    return containsCjk(phraseInput.value);
  }

  function getPhraseFinalHanzi() {
    return (phraseInputHasCjk() ? phraseInput.value : phraseHanziBuffer).trim();
  }

  function updatePhrasePreview() {
    var text = phraseInputHasCjk() ? phraseInput.value : phraseHanziBuffer;
    phraseHanziPreview.textContent = text || " ";
  }

  function updatePhraseTagsPreview() {
    var hanzi = getPhraseFinalHanzi();
    phraseTagsPreview.innerHTML = "";
    var info = hanzi ? derivePhraseTags(hanzi, entries) : { tags: [] };
    if (!info.tags.length) {
      var hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = "No matching words yet.";
      phraseTagsPreview.appendChild(hint);
      return;
    }
    info.tags.forEach(function (tag) {
      var pill = document.createElement("span");
      pill.className = "meaning-pill";
      pill.textContent = tag;
      phraseTagsPreview.appendChild(pill);
    });
  }

  function clearPhraseCandidates() {
    phraseCandidatesPanel.innerHTML = "";
  }

  function renderPhraseCandidates() {
    clearPhraseCandidates();
    var token = lastSyllableToken(phraseInput);
    if (!/[1-5]$/.test(token)) return;

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
        phraseHanziBuffer += hanzi;
        phraseInput.value = phraseInput.value.replace(/\S+$/, converted) + " ";
        phrasePinyinInput.value = convertPinyin(phraseInput.value);
        updatePhrasePreview();
        updatePhraseTagsPreview();
        clearPhraseCandidates();
        phraseInput.focus();
      });

      phraseCandidatesPanel.appendChild(btn);
    });
  }

  phraseInput.addEventListener("input", function () {
    if (phraseInputHasCjk()) {
      phraseHanziBuffer = "";
      clearPhraseCandidates();
    } else {
      phrasePinyinInput.value = convertPinyin(phraseInput.value);
      renderPhraseCandidates();
    }
    updatePhrasePreview();
    updatePhraseTagsPreview();
  });

  phraseForm.addEventListener("submit", function (event) {
    event.preventDefault();
    phraseFormError.textContent = "";

    var hanzi = getPhraseFinalHanzi();
    if (!hanzi) {
      phraseFormError.textContent = "Hanzi is required — type pinyin to build it, or paste Hanzi directly.";
      return;
    }

    var pinyin = phrasePinyinInput.value.trim();
    if (!pinyin) {
      pinyin = autoFillPinyinForHanzi(hanzi, entries);
    }

    phrases.push({
      id: makeId(),
      hanzi: hanzi,
      pinyin: pinyin,
      meaning: phraseMeaningInput.value.trim(),
      createdAt: new Date().toISOString()
    });

    persistEntries();
    renderAll();

    phraseForm.reset();
    phraseHanziBuffer = "";
    clearPhraseCandidates();
    updatePhrasePreview();
    updatePhraseTagsPreview();
    phraseInput.focus();
  });

  updatePhraseTagsPreview();

  // ---- search ----

  var searchInput = document.getElementById("search-input");
  var searchResults = document.getElementById("search-results");
  var SEARCH_INLINE_CAP = 6;
  var searchPageState = { page: 1, pageSize: 20 };
  var searchExpanded = false;

  function computeSearchMatches(query) {
    var q = query.trim().toLowerCase();
    if (!q) return { words: [], phrases: [] };
    var qPlain = stripDiacritics(q);

    var matchedWords = entries.filter(function (w) {
      return (
        w.hanzi.toLowerCase().indexOf(q) !== -1 ||
        stripDiacritics(w.pinyin.toLowerCase()).indexOf(qPlain) !== -1 ||
        w.meaning.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; })
      );
    });

    var matchedPhrases = phrases.filter(function (p) {
      var info = derivePhraseTags(p.hanzi, entries);
      return (
        p.hanzi.toLowerCase().indexOf(q) !== -1 ||
        info.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; })
      );
    });

    return { words: matchedWords, phrases: matchedPhrases };
  }

  function buildTagsRow(tags) {
    var tagsEl = document.createElement("div");
    tagsEl.className = "rc-tags";
    tags.forEach(function (tag) {
      var pill = document.createElement("span");
      pill.className = "meaning-pill";
      pill.textContent = tag;
      tagsEl.appendChild(pill);
    });
    return tagsEl;
  }

  function buildHeadword(kindLabel, hanzi, pinyin) {
    var head = document.createElement("div");
    head.className = "rc-headword";
    var kind = document.createElement("div");
    kind.className = "rc-kind";
    kind.textContent = kindLabel;
    var hanziEl = document.createElement("div");
    hanziEl.className = "rc-hanzi";
    hanziEl.textContent = hanzi;
    var pinyinEl = document.createElement("div");
    pinyinEl.className = "rc-pinyin";
    pinyinEl.textContent = pinyin;
    head.appendChild(kind);
    head.appendChild(hanziEl);
    head.appendChild(pinyinEl);
    return head;
  }

  function buildWordCard(word) {
    var card = document.createElement("div");
    card.className = "result-card";

    var phrasesEl = document.createElement("div");
    phrasesEl.className = "rc-phrases";
    var top = topPhrasesForWord(word, phrases, entries, 2);
    if (!top.length) {
      var none = document.createElement("div");
      none.className = "rc-phrase-meaning rc-none";
      none.textContent = "No example sentences yet.";
      phrasesEl.appendChild(none);
    } else {
      top.forEach(function (item) {
        var line = document.createElement("div");
        line.className = "rc-phrase-hanzi";
        line.textContent = item.phrase.hanzi;
        var meaningLine = document.createElement("div");
        meaningLine.className = "rc-phrase-meaning";
        meaningLine.textContent = item.phrase.meaning || "(no meaning yet)";
        phrasesEl.appendChild(line);
        phrasesEl.appendChild(meaningLine);
      });
    }

    card.appendChild(buildHeadword("Word", word.hanzi, word.pinyin));

    if (editingWordId === word.id) {
      var editingTagsEl = document.createElement("div");
      editingTagsEl.className = "rc-tags";
      editingTagsEl.appendChild(buildWordTagsEditor(word));
      card.appendChild(editingTagsEl);
    } else {
      var tagsEl = buildTagsRow(word.meaning);
      tagsEl.appendChild(buildEditTrigger(function () {
        editingWordId = word.id;
        renderAll();
      }, "Edit tags for " + word.hanzi));
      card.appendChild(tagsEl);
    }

    card.appendChild(phrasesEl);
    return card;
  }

  function buildPhraseCard(phrase) {
    var card = document.createElement("div");
    card.className = "result-card";

    var info = derivePhraseTags(phrase.hanzi, entries);

    var phrasesEl = document.createElement("div");
    phrasesEl.className = "rc-phrases";
    if (editingPhraseId === phrase.id) {
      phrasesEl.appendChild(buildPhraseMeaningEditor(phrase));
    } else {
      var meaningLine = document.createElement("div");
      meaningLine.className = "rc-phrase-meaning";
      meaningLine.textContent = phrase.meaning || "(no meaning yet)";
      phrasesEl.appendChild(meaningLine);
      phrasesEl.appendChild(buildEditTrigger(function () {
        editingPhraseId = phrase.id;
        renderAll();
      }, "Edit meaning for " + phrase.hanzi));
    }

    card.appendChild(buildHeadword("Phrase", phrase.hanzi, phrase.pinyin));
    card.appendChild(buildTagsRow(info.tags));
    card.appendChild(phrasesEl);
    return card;
  }

  function renderSearch() {
    var query = searchInput.value;
    if (!query.trim()) {
      searchResults.hidden = true;
      searchResults.innerHTML = "";
      searchExpanded = false;
      return;
    }

    var matches = computeSearchMatches(query);
    var combined = matches.words
      .map(function (w) { return { type: "word", item: w, createdAt: w.createdAt }; })
      .concat(matches.phrases.map(function (p) { return { type: "phrase", item: p, createdAt: p.createdAt }; }));
    combined.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    searchResults.hidden = false;
    searchResults.innerHTML = "";

    if (!combined.length) {
      var noneMsg = document.createElement("p");
      noneMsg.className = "empty-state";
      noneMsg.textContent = "No matches in your saved words or phrases.";
      searchResults.appendChild(noneMsg);
      return;
    }

    var visibleItems = searchExpanded ? paginate(combined, searchPageState) : combined.slice(0, SEARCH_INLINE_CAP);

    visibleItems.forEach(function (wrap) {
      var card = wrap.type === "word" ? buildWordCard(wrap.item) : buildPhraseCard(wrap.item);
      searchResults.appendChild(card);
    });

    if (!searchExpanded && combined.length > SEARCH_INLINE_CAP) {
      var remaining = combined.length - SEARCH_INLINE_CAP;
      var showMoreBtn = document.createElement("button");
      showMoreBtn.type = "button";
      showMoreBtn.className = "search-show-more";
      showMoreBtn.textContent = "Show " + remaining + " more result" + (remaining === 1 ? "" : "s");
      showMoreBtn.addEventListener("click", function () {
        searchExpanded = true;
        searchPageState.page = 1;
        renderSearch();
      });
      searchResults.appendChild(showMoreBtn);
    } else if (searchExpanded) {
      var paginationContainer = document.createElement("div");
      paginationContainer.className = "pagination";
      searchResults.appendChild(paginationContainer);
      renderPaginationControls(paginationContainer, searchPageState, combined.length, renderSearch);
    }
  }

  searchInput.addEventListener("input", function () {
    searchExpanded = false;
    searchPageState.page = 1;
    renderSearch();
  });

  function renderAll() {
    renderWordTable();
    renderPhraseTable();
    renderSearch();
  }

  // ---- word key / merge (dedup by hanzi + pinyin + meaning set) ----

  function entryKey(e) {
    var meaningKey = e.meaning.slice().sort().join("");
    return e.hanzi + "" + e.pinyin + "" + meaningKey;
  }

  function mergeEntries(newOnes) {
    var existingKeys = {};
    entries.forEach(function (e) { existingKeys[entryKey(e)] = true; });

    var added = 0;
    (newOnes || []).forEach(function (raw) {
      var hanzi = (raw.hanzi || "").trim();
      var pinyin = (raw.pinyin || "").trim();
      var meaning = normalizeMeaning(raw.meaning);
      if (!hanzi || !pinyin || meaning.length === 0) return;

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

  // ---- phrase key / merge (dedup by exact hanzi text) ----

  function mergePhrases(newOnes) {
    var existingKeys = {};
    phrases.forEach(function (p) { existingKeys[p.hanzi] = true; });

    var added = 0;
    (newOnes || []).forEach(function (raw) {
      var hanzi = (raw.hanzi || "").trim();
      if (!hanzi || existingKeys[hanzi]) return;
      existingKeys[hanzi] = true;

      phrases.push({
        id: raw.id || makeId(),
        hanzi: hanzi,
        pinyin: (raw.pinyin || "").trim(),
        meaning: (raw.meaning || "").trim(),
        createdAt: raw.createdAt || new Date().toISOString()
      });
      added++;
    });
    return added;
  }

  // ---- JSON export/import (words + phrases together) ----

  var ioStatus = document.getElementById("io-status");

  document.getElementById("export-json-btn").addEventListener("click", function () {
    download(
      "mandarin-word-list.json",
      JSON.stringify({ words: entries, phrases: phrases }, null, 2),
      "application/json"
    );
  });

  document.getElementById("import-json-input").addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        var wordsIn, phrasesIn;
        if (Array.isArray(parsed)) {
          wordsIn = parsed; // legacy words-only export
          phrasesIn = [];
        } else if (parsed && typeof parsed === "object") {
          wordsIn = Array.isArray(parsed.words) ? parsed.words : [];
          phrasesIn = Array.isArray(parsed.phrases) ? parsed.phrases : [];
        } else {
          throw new Error("Unrecognized JSON shape.");
        }

        var addedWords = mergeEntries(wordsIn);
        var addedPhrases = mergePhrases(phrasesIn);
        persistEntries();
        renderAll();
        ioStatus.textContent =
          "Imported " + addedWords + " word" + (addedWords === 1 ? "" : "s") +
          " and " + addedPhrases + " phrase" + (addedPhrases === 1 ? "" : "s") + ".";
      } catch (err) {
        ioStatus.textContent = "Import failed: " + err.message;
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  });

  // ---- word CSV export/import (scoped to Words browse tab) ----

  var wordCsvStatus = document.getElementById("word-csv-status");

  document.getElementById("export-words-csv-btn").addEventListener("click", function () {
    var rows = [["hanzi", "pinyin", "meaning", "createdAt"]];
    entries.forEach(function (e) {
      rows.push([e.hanzi, e.pinyin, e.meaning.join("; "), e.createdAt]);
    });
    var csv = rows.map(function (row) { return row.map(csvEscape).join(","); }).join("\n");
    download("mandarin-word-list-words.csv", csv, "text/csv");
  });

  document.getElementById("import-words-csv-input").addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      try {
        var rows = parseCsv(String(reader.result));
        if (!rows.length) throw new Error("CSV file is empty.");
        var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
        var hIdx = header.indexOf("hanzi");
        var pIdx = header.indexOf("pinyin");
        var mIdx = header.indexOf("meaning");
        if (hIdx === -1 || pIdx === -1 || mIdx === -1) {
          throw new Error("CSV header must include hanzi, pinyin, meaning columns.");
        }
        var objs = rows.slice(1).map(function (r) {
          var tags = (r[mIdx] || "").split(/\s*;\s*/).filter(Boolean);
          return { hanzi: r[hIdx], pinyin: r[pIdx], meaning: tags };
        });
        var added = mergeEntries(objs);
        persistEntries();
        renderAll();
        wordCsvStatus.textContent = "Imported " + added + " new word" + (added === 1 ? "" : "s") + ".";
      } catch (err) {
        wordCsvStatus.textContent = "Import failed: " + err.message;
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  });

  // ---- phrase CSV export/import (scoped to Phrases browse tab) ----

  var phraseCsvStatus = document.getElementById("phrase-csv-status");

  document.getElementById("export-phrases-csv-btn").addEventListener("click", function () {
    var rows = [["hanzi", "pinyin", "meaning", "tags", "createdAt"]];
    phrases.forEach(function (p) {
      var info = derivePhraseTags(p.hanzi, entries);
      rows.push([p.hanzi, p.pinyin, p.meaning, info.tags.join("; "), p.createdAt]);
    });
    var csv = rows.map(function (row) { return row.map(csvEscape).join(","); }).join("\n");
    download("mandarin-word-list-phrases.csv", csv, "text/csv");
  });

  document.getElementById("import-phrases-csv-input").addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      try {
        var rows = parseCsv(String(reader.result));
        if (!rows.length) throw new Error("CSV file is empty.");
        var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
        var hIdx = header.indexOf("hanzi");
        var pIdx = header.indexOf("pinyin");
        var mIdx = header.indexOf("meaning");
        if (hIdx === -1) throw new Error("CSV header must include a hanzi column.");
        // "tags" column, if present, is ignored on import -- tags are always
        // derived dynamically from the current word list, never stored.
        var objs = rows.slice(1).map(function (r) {
          return {
            hanzi: r[hIdx],
            pinyin: pIdx !== -1 ? r[pIdx] : "",
            meaning: mIdx !== -1 ? r[mIdx] : ""
          };
        });
        var added = mergePhrases(objs);
        persistEntries();
        renderAll();
        phraseCsvStatus.textContent = "Imported " + added + " new phrase" + (added === 1 ? "" : "s") + ".";
      } catch (err) {
        phraseCsvStatus.textContent = "Import failed: " + err.message;
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  });

  // ---- internal browser storage (Origin Private File System) ----
  //
  // A real file, managed entirely by the browser, that autosaves with no
  // folder picker and no permission prompt -- the "predetermined internal
  // folder" default. It's sandboxed per-origin and isn't visible in a normal
  // file browser; that's what makes it permission-free. Supported in Chrome
  // and Edge when the page is served over http(s); NOT available when the
  // page is opened directly as a file:// URL, so this silently does nothing
  // in that case and localStorage (always active) remains the baseline.

  var OPFS_SAVE_FILENAME = "mandarin-word-list.json";
  var opfsSupported = !!(navigator.storage && typeof navigator.storage.getDirectory === "function");
  var opfsRootPromise = null;
  var opfsStatus = document.getElementById("opfs-status");

  function getOpfsRoot() {
    if (!opfsSupported) return Promise.resolve(null);
    if (!opfsRootPromise) {
      opfsRootPromise = navigator.storage.getDirectory().catch(function () { return null; });
    }
    return opfsRootPromise;
  }

  function snapshotPayload() {
    return JSON.stringify({ words: entries, phrases: phrases }, null, 2);
  }

  function parseSnapshotPayload(text) {
    if (!text.trim()) return { words: [], phrases: [] };
    var parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { words: parsed, phrases: [] };
    return {
      words: Array.isArray(parsed.words) ? parsed.words : [],
      phrases: Array.isArray(parsed.phrases) ? parsed.phrases : []
    };
  }

  function writeSnapshotToOpfs() {
    return getOpfsRoot().then(function (root) {
      if (!root) return;
      return root.getFileHandle(OPFS_SAVE_FILENAME, { create: true })
        .then(function (fileHandle) { return fileHandle.createWritable(); })
        .then(function (writable) {
          return writable.write(snapshotPayload()).then(function () {
            return writable.close();
          });
        })
        .catch(function () { /* best-effort; localStorage is still the source of truth */ });
    });
  }

  function readOpfsData() {
    return getOpfsRoot().then(function (root) {
      if (!root) return null;
      return root.getFileHandle(OPFS_SAVE_FILENAME)
        .then(function (fileHandle) { return fileHandle.getFile(); })
        .then(function (file) { return file.text(); })
        .then(parseSnapshotPayload)
        .catch(function () { return null; });
    });
  }

  if (opfsSupported) {
    // getDirectory() exists in Chrome/Edge even when the page can't actually
    // use it (e.g. opened as a file:// URL, where it throws SecurityError).
    // Only announce/rely on it once we've confirmed it really works here.
    getOpfsRoot().then(function (root) {
      if (!root) return;
      opfsStatus.textContent = "+ browser-internal backup (automatic)";
      // Merge in anything already saved to internal storage (e.g. from a
      // previous visit before localStorage existed, or after it was
      // cleared), then make sure internal storage has today's list too.
      return readOpfsData().then(function (data) {
        if (data === null) {
          return writeSnapshotToOpfs();
        }
        var addedWords = mergeEntries(data.words);
        var addedPhrases = mergePhrases(data.phrases);
        if (addedWords > 0 || addedPhrases > 0) {
          saveEntries(entries);
          savePhrases(phrases);
          renderAll();
        }
        return writeSnapshotToOpfs();
      });
    });
  }

  // ---- local folder sync (File System Access API: Chrome, Edge) ----

  var FOLDER_SAVE_FILENAME = "mandarin-word-list.json";
  var FOLDER_HANDLE_DB = "mandarinWordList.folderHandle";
  var FOLDER_HANDLE_STORE = "handles";
  var FOLDER_HANDLE_KEY = "lastFolder";

  var folderSyncSupported = typeof window.showDirectoryPicker === "function" && "indexedDB" in window;
  var connectedDirHandle = null;
  var pendingReconnectHandle = null;

  var connectFolderBtn = document.getElementById("connect-folder-btn");
  var disconnectFolderBtn = document.getElementById("disconnect-folder-btn");
  var folderStatus = document.getElementById("folder-status");

  function setFolderStatus(text) {
    folderStatus.textContent = text || "";
  }

  function setConnectedUi(dirHandle) {
    pendingReconnectHandle = null;
    connectFolderBtn.hidden = true;
    disconnectFolderBtn.hidden = false;
    setFolderStatus("Connected: “" + dirHandle.name + "” (autosaving)");
  }

  function setDisconnectedUi(message) {
    pendingReconnectHandle = null;
    connectFolderBtn.hidden = false;
    connectFolderBtn.textContent = "Connect Local Folder";
    disconnectFolderBtn.hidden = true;
    setFolderStatus(message);
  }

  // Minimal IndexedDB key-value wrapper, just to persist the directory handle
  // itself (FileSystemDirectoryHandle objects are structured-cloneable) so the
  // app can offer to resume the same folder on the next visit.
  function openHandleDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(FOLDER_HANDLE_DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(FOLDER_HANDLE_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(key) {
    return openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(FOLDER_HANDLE_STORE, "readonly").objectStore(FOLDER_HANDLE_STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbSet(key, value) {
    return openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FOLDER_HANDLE_STORE, "readwrite");
        tx.objectStore(FOLDER_HANDLE_STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbDelete(key) {
    return openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FOLDER_HANDLE_STORE, "readwrite");
        tx.objectStore(FOLDER_HANDLE_STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function writeSnapshotToFolder() {
    if (!connectedDirHandle) return Promise.resolve();
    return connectedDirHandle.getFileHandle(FOLDER_SAVE_FILENAME, { create: true })
      .then(function (fileHandle) { return fileHandle.createWritable(); })
      .then(function (writable) {
        return writable.write(snapshotPayload()).then(function () {
          return writable.close();
        });
      })
      .catch(function (err) {
        setFolderStatus("Autosave to folder failed: " + err.message);
      });
  }

  // Saves to localStorage (always), internal browser storage (if supported),
  // and the explicitly connected folder (if any) -- words and phrases both.
  function persistEntries() {
    saveEntries(entries);
    savePhrases(phrases);
    writeSnapshotToOpfs();
    writeSnapshotToFolder();
  }

  // Reads the save file from a folder. Resolves null if the folder doesn't
  // have one yet (first time connecting this folder).
  function readFolderData(dirHandle) {
    return dirHandle.getFileHandle(FOLDER_SAVE_FILENAME)
      .then(function (fileHandle) { return fileHandle.getFile(); })
      .then(function (file) { return file.text(); })
      .then(parseSnapshotPayload)
      .catch(function (err) {
        if (err && err.name === "NotFoundError") return null;
        throw err;
      });
  }

  function connectToFolder(dirHandle) {
    connectedDirHandle = dirHandle;
    return readFolderData(dirHandle)
      .then(function (data) {
        if (data === null) {
          return writeSnapshotToFolder().then(function () { return { words: 0, phrases: 0 }; });
        }
        var addedWords = mergeEntries(data.words);
        var addedPhrases = mergePhrases(data.phrases);
        saveEntries(entries);
        savePhrases(phrases);
        renderAll();
        return writeSnapshotToFolder().then(function () { return { words: addedWords, phrases: addedPhrases }; });
      })
      .then(function (added) {
        setConnectedUi(dirHandle);
        if (added.words > 0 || added.phrases > 0) {
          setFolderStatus(
            "Connected: “" + dirHandle.name + "” (autosaving) — merged " +
            added.words + " word" + (added.words === 1 ? "" : "s") + " and " +
            added.phrases + " phrase" + (added.phrases === 1 ? "" : "s") + " from folder."
          );
        }
      })
      .catch(function (err) {
        connectedDirHandle = null;
        setDisconnectedUi("Couldn't read “" + dirHandle.name + "”: " + err.message);
      });
  }

  if (!folderSyncSupported) {
    connectFolderBtn.disabled = true;
    setFolderStatus("Local folder sync needs Chrome or Edge (File System Access API).");
  } else {
    connectFolderBtn.addEventListener("click", function () {
      if (pendingReconnectHandle) {
        var handle = pendingReconnectHandle;
        handle.requestPermission({ mode: "readwrite" }).then(function (result) {
          if (result === "granted") {
            connectToFolder(handle);
          } else {
            idbDelete(FOLDER_HANDLE_KEY).catch(function () {});
            setDisconnectedUi("Permission denied for “" + handle.name + "”.");
          }
        });
        return;
      }

      window.showDirectoryPicker({ mode: "readwrite" })
        .then(function (dirHandle) {
          return idbSet(FOLDER_HANDLE_KEY, dirHandle).then(function () {
            return connectToFolder(dirHandle);
          });
        })
        .catch(function (err) {
          if (err && err.name === "AbortError") return; // user closed the picker
          setFolderStatus("Couldn't connect: " + err.message);
        });
    });

    disconnectFolderBtn.addEventListener("click", function () {
      connectedDirHandle = null;
      idbDelete(FOLDER_HANDLE_KEY).catch(function () {});
      setDisconnectedUi("Disconnected. Entries stay saved in this browser.");
    });

    // Resume the last-connected folder automatically when possible. Browsers
    // only let queryPermission() run without a user gesture, so a silent
    // resume only happens if permission is still granted from this session;
    // otherwise we surface a one-click "Reconnect" instead of the full
    // folder picker, since requestPermission() needs a user gesture.
    idbGet(FOLDER_HANDLE_KEY)
      .then(function (dirHandle) {
        if (!dirHandle) return;
        return dirHandle.queryPermission({ mode: "readwrite" }).then(function (permission) {
          if (permission === "granted") {
            return connectToFolder(dirHandle);
          }
          pendingReconnectHandle = dirHandle;
          connectFolderBtn.hidden = false;
          connectFolderBtn.textContent = "Reconnect to “" + dirHandle.name + "”";
          disconnectFolderBtn.hidden = false;
          setFolderStatus("Click to resume autosaving to this folder.");
        });
      })
      .catch(function () { /* no previous folder, or it's no longer accessible */ });
  }

  renderAll();
})();
