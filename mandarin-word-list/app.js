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
        e.meaning.some(function (tag) { return tag.toLowerCase().indexOf(query) !== -1; })
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
        meaningTd.className = "meaning-cell";
        entry.meaning.forEach(function (tag) {
          var pill = document.createElement("span");
          pill.className = "meaning-pill";
          pill.textContent = tag;
          meaningTd.appendChild(pill);
        });

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
          persistEntries();
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
  var meaningTagContainer = document.getElementById("meaning-tag-input");
  var formError = document.getElementById("form-error");
  var candidatesPanel = document.getElementById("candidates-panel");

  // ---- meaning tags ----

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
    render();

    form.reset();
    pinyinPreview.textContent = " ";
    clearCandidates();
    resetMeaningTags();
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
      rows.push([e.hanzi, e.pinyin, e.meaning.join("; "), e.createdAt]);
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
    var meaningKey = e.meaning.slice().sort().join("");
    return e.hanzi + "" + e.pinyin + "" + meaningKey;
  }

  function mergeEntries(newOnes) {
    var existingKeys = {};
    entries.forEach(function (e) { existingKeys[entryKey(e)] = true; });

    var added = 0;
    newOnes.forEach(function (raw) {
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
            var tags = (r[mIdx] || "").split(/\s*;\s*/).filter(Boolean);
            return { hanzi: r[hIdx], pinyin: r[pIdx], meaning: tags };
          });
          added = mergeEntries(objs);
        }
        persistEntries();
        render();
        ioStatus.textContent = "Imported " + added + " new entr" + (added === 1 ? "y" : "ies") + ".";
      } catch (err) {
        ioStatus.textContent = "Import failed: " + err.message;
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

  function writeSnapshotToOpfs() {
    return getOpfsRoot().then(function (root) {
      if (!root) return;
      return root.getFileHandle(OPFS_SAVE_FILENAME, { create: true })
        .then(function (fileHandle) { return fileHandle.createWritable(); })
        .then(function (writable) {
          return writable.write(JSON.stringify(entries, null, 2)).then(function () {
            return writable.close();
          });
        })
        .catch(function () { /* best-effort; localStorage is still the source of truth */ });
    });
  }

  function readOpfsEntries() {
    return getOpfsRoot().then(function (root) {
      if (!root) return null;
      return root.getFileHandle(OPFS_SAVE_FILENAME)
        .then(function (fileHandle) { return fileHandle.getFile(); })
        .then(function (file) { return file.text(); })
        .then(function (text) {
          if (!text.trim()) return [];
          var parsed = JSON.parse(text);
          return Array.isArray(parsed) ? parsed : [];
        })
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
      return readOpfsEntries().then(function (opfsEntries) {
        if (opfsEntries === null) {
          return writeSnapshotToOpfs();
        }
        var added = mergeEntries(opfsEntries);
        if (added > 0) {
          saveEntries(entries);
          render();
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
        return writable.write(JSON.stringify(entries, null, 2)).then(function () {
          return writable.close();
        });
      })
      .catch(function (err) {
        setFolderStatus("Autosave to folder failed: " + err.message);
      });
  }

  // Saves to localStorage (always), internal browser storage (if supported),
  // and the explicitly connected folder (if any).
  function persistEntries() {
    saveEntries(entries);
    writeSnapshotToOpfs();
    writeSnapshotToFolder();
  }

  // Reads the save file from a folder. Resolves null if the folder doesn't
  // have one yet (first time connecting this folder).
  function readFolderEntries(dirHandle) {
    return dirHandle.getFileHandle(FOLDER_SAVE_FILENAME)
      .then(function (fileHandle) { return fileHandle.getFile(); })
      .then(function (file) { return file.text(); })
      .then(function (text) {
        if (!text.trim()) return [];
        var parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
      })
      .catch(function (err) {
        if (err && err.name === "NotFoundError") return null;
        throw err;
      });
  }

  function connectToFolder(dirHandle) {
    connectedDirHandle = dirHandle;
    return readFolderEntries(dirHandle)
      .then(function (folderEntries) {
        if (folderEntries === null) {
          return writeSnapshotToFolder().then(function () { return 0; });
        }
        var added = mergeEntries(folderEntries);
        saveEntries(entries);
        render();
        return writeSnapshotToFolder().then(function () { return added; });
      })
      .then(function (added) {
        setConnectedUi(dirHandle);
        if (added > 0) {
          setFolderStatus(
            "Connected: “" + dirHandle.name + "” (autosaving) — merged " +
            added + " entr" + (added === 1 ? "y" : "ies") + " from folder."
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

  render();
})();
