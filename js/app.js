/*!
 * Raysin Calculator · interfaccia
 * Vanilla JS, nessuna dipendenza. Dati in localStorage, nessuna rete.
 */
(function () {
  'use strict';

  var APP_VERSION = '1.0.0';
  var C = window.RaysinCalc;
  var KEYS = {
    settings: 'raysin.settings.v1',
    molds: 'raysin.molds.v1',
    name: 'raysin.pourName.v1',
    history: 'raysin.history.v1',
    ui: 'raysin.ui.v1'
  };
  var MAX_HISTORY = 500;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =========================================================
     Archivio locale
     ========================================================= */

  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        try { return JSON.parse(raw); } catch (e) { return typeof fallback === 'string' ? raw : fallback; }
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { toast('Spazio di archiviazione non disponibile: i dati non sono stati salvati.'); return false; }
    }
  };

  function loadMolds(raw) {
    return (Array.isArray(raw) ? raw : []).map(C.normalizeMold).filter(Boolean);
  }
  function loadHistory(raw) {
    return (Array.isArray(raw) ? raw : []).filter(function (h) {
      return h && typeof h === 'object' && typeof h.id === 'string' && h.result && Array.isArray(h.molds);
    });
  }

  var state = {
    settings: C.normalizeSettings(store.get(KEYS.settings, {})),
    molds: loadMolds(store.get(KEYS.molds, [])),
    name: String(store.get(KEYS.name, '') || ''),
    history: loadHistory(store.get(KEYS.history, [])),
    ui: Object.assign({ view: 'calc', hintClosed: false, unseen: 0 }, store.get(KEYS.ui, {}))
  };
  var result = C.compute(state.molds, state.settings);
  var justAdded = null;

  function saveSettings() { store.set(KEYS.settings, state.settings); }
  function saveMolds() { store.set(KEYS.molds, state.molds); }
  function saveHistory() { store.set(KEYS.history, state.history); }
  function saveUi() { store.set(KEYS.ui, state.ui); }

  /* =========================================================
     Utilità
     ========================================================= */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(id) { return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function plural(n, one, many) { return n === 1 ? one : many; }
  function haptic() { if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} } }

  var ICON_RULES = [
    [/cuor|heart/i, 'i-heart'],
    [/fior|rosa|margherit|petal|flower|peonia|tulip/i, 'i-flower'],
    [/vassoi|piatt|svuota|tray|alzat/i, 'i-tray'],
    [/candel|candle|tealight|lumin/i, 'i-candle'],
    [/stell|star/i, 'i-star'],
    [/sottobicch|coaster|sottopentol|tondo|cerchio/i, 'i-coaster'],
    [/luna|moon/i, 'i-moon'],
    [/goccia|drop/i, 'i-drop']
  ];
  function moldIcon(name) {
    for (var i = 0; i < ICON_RULES.length; i++) if (ICON_RULES[i][0].test(name)) return ICON_RULES[i][1];
    return 'i-mold';
  }

  /* =========================================================
     Animazione dei valori
     ========================================================= */

  // riduce il corpo dei numeri molto lunghi finché entrano nel loro riquadro
  var FIT_SEL = '.mix-value, .money-value, .stat-value';
  function fitBox(box) {
    if (!box || !box.clientWidth) return;
    box.style.fontSize = '';
    var base = parseFloat(getComputedStyle(box).fontSize), size = base, n = 0;
    while (box.scrollWidth > box.clientWidth + 1 && size > base * 0.45 && n++ < 16) {
      size *= 0.92;
      box.style.fontSize = size.toFixed(2) + 'px';
    }
  }
  function fitAll() { $$(FIT_SEL).forEach(fitBox); }

  function setOut(key, value, format, empty) {
    $$('[data-out="' + key + '"]').forEach(function (el) {
      var target = (value === null || value === undefined || !isFinite(value)) ? null : value;
      var prev = typeof el._v === 'number' ? el._v : null;
      el._v = target;
      if (target === null) { cancelAnimationFrame(el._raf); clearTimeout(el._fin); el.textContent = empty || '—'; fitBox(el.closest(FIT_SEL)); return; }
      var finalText = format(target);
      var box = el.closest(FIT_SEL);
      if (box) { var shown = el.textContent; el.textContent = finalText; fitBox(box); el.textContent = shown; }
      if (prev === null || reduceMotion || prev === target || !el._ready) {
        cancelAnimationFrame(el._raf); clearTimeout(el._fin);
        el.textContent = finalText;
        el._ready = true;
        return;
      }
      cancelAnimationFrame(el._raf);
      clearTimeout(el._fin);
      if (el.textContent === finalText) return;
      var t0 = performance.now(), dur = 420;
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = p < 1 ? format(prev + (target - prev) * e) : finalText;
        if (p < 1) el._raf = requestAnimationFrame(step);
      })(t0);
      // garanzia: il valore finale arriva comunque (rAF è sospeso se la pagina non è visibile)
      el._fin = setTimeout(function () { cancelAnimationFrame(el._raf); el.textContent = finalText; }, dur + 80);
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    });
  }

  /* =========================================================
     Render · colata
     ========================================================= */

  function render() {
    result = C.compute(state.molds, state.settings);
    renderMolds();
    renderResult();
  }

  function renderMolds() {
    var list = $('#moldList');
    var r = result;
    list.innerHTML = state.molds.map(function (m) {
      var total = m.volume * m.qty;
      return '<li class="mold' + (m.id === justAdded ? ' enter' : '') + '" data-id="' + esc(m.id) + '">' +
        '<div class="mold-icon">' + icon(moldIcon(m.name)) + '</div>' +
        '<button class="mold-main" data-act="edit" aria-label="Modifica ' + esc(m.name) + '">' +
          '<span class="mold-name">' + esc(m.name) + '</span>' +
          '<span class="mold-meta"><b>' + C.fmtVolume(total) + ' ml</b>' + (m.qty > 1 ? ' · ' + C.fmtVolume(m.volume) + ' × ' + m.qty : '') + '</span>' +
        '</button>' +
        '<div class="stepper" role="group" aria-label="Copie di ' + esc(m.name) + '">' +
          '<button class="step" data-act="dec" aria-label="Una copia in meno"' + (m.qty <= 1 ? ' disabled' : '') + '>' + icon('i-minus') + '</button>' +
          '<span class="step-value" aria-live="polite">' + m.qty + '</span>' +
          '<button class="step" data-act="inc" aria-label="Una copia in più"' + (m.qty >= C.LIMITS.qty[1] ? ' disabled' : '') + '>' + icon('i-plus') + '</button>' +
        '</div>' +
        '<button class="icon-btn mold-more" data-act="more" aria-label="Altre azioni per ' + esc(m.name) + '">' + icon('i-more') + '</button>' +
      '</li>';
    }).join('');
    justAdded = null;

    var has = state.molds.length > 0;
    $('#moldsEmpty').hidden = has;
    $('#moldsTotal').hidden = !has;
    $('#clearMolds').hidden = !has;
    $('#moldsSub').textContent = has
      ? r.molds + ' ' + plural(r.molds, 'stampo', 'stampi') + ' · ' + r.pieces + ' ' + plural(r.pieces, 'pezzo', 'pezzi')
      : 'Nessuno stampo';
    $('#totVolume').textContent = C.fmtVolume(r.volume) + ' ml';
    $('#totPieces').textContent = r.pieces + ' ' + plural(r.pieces, 'pezzo', 'pezzi');
  }

  function renderResult() {
    var r = result, s = state.settings;
    setOut('powder', r.powder, C.fmtInt);
    setOut('water', r.water, C.fmtInt);
    setOut('volume', r.volume, C.fmtVolume);
    setOut('pieces', r.pieces, C.fmtInt);
    setOut('cost', r.cost, C.fmtEuro);
    setOut('costPerPiece', r.costPerPiece, C.fmtEuro);
    setOut('costPerKg', r.costPerKg, C.fmtEuro);
    setOut('casts', r.castsPerPack, function (v) { return C.fmtDecimal(v, 1); });

    var note = '';
    if (r.castsPerPack !== null) {
      if (r.packsNeeded > 1) note = 'Servono ' + r.packsNeeded + ' sacchi';
      else note = r.fullCasts + ' ' + plural(r.fullCasts, 'colata completa', 'colate complete');
    }
    $('#castsNote').textContent = note;

    $('#marginChipVal').textContent = s.margin + '%';
    $('#materialLabel').textContent = s.material;
    $('#costKgLabel').textContent = s.material + ' al kg';
    $('#summary').textContent = C.summaryText(r);
    $('#footnoteText').textContent = 'Resa indicativa di ' + C.fmtInt(s.yieldMlPerKg) + ' ml di impasto per kg di polvere. ' +
      "Il volume dell'impasto non è la somma dei pesi di acqua e polvere.";
    $('#resultCard').classList.toggle('is-empty', !r.pieces);
    $('#saveBtn').disabled = !r.pieces;
    $('#shareBtn').disabled = !r.pieces;

    // derivati nelle impostazioni
    $('#derivedKg').textContent = C.fmtEuro(r.costPerKg);
    $('#derivedGram').textContent = C.fmtEuroPrecise(r.costPerGram);
    $('#hsPowderLabel').textContent = s.material;
  }

  /* =========================================================
     Stampi · azioni
     ========================================================= */

  function findMold(id) {
    for (var i = 0; i < state.molds.length; i++) if (state.molds[i].id === id) return i;
    return -1;
  }

  function addMold(data) {
    var m = C.normalizeMold(Object.assign({ id: C.uid() }, data));
    if (!m) return null;
    state.molds.push(m);
    justAdded = m.id;
    saveMolds(); render();
    return m;
  }

  function updateMold(id, data) {
    var i = findMold(id);
    if (i < 0) return;
    var m = C.normalizeMold(Object.assign({}, state.molds[i], data, { id: id }));
    if (!m) return;
    state.molds[i] = m;
    saveMolds(); render();
  }

  function duplicateMold(id) {
    var i = findMold(id);
    if (i < 0) return;
    var src = state.molds[i];
    var copy = { id: C.uid(), name: src.name + ' (copia)', volume: src.volume, qty: src.qty };
    state.molds.splice(i + 1, 0, copy);
    justAdded = copy.id;
    saveMolds(); render();
    toast('Stampo duplicato');
  }

  function deleteMold(id) {
    var i = findMold(id);
    if (i < 0) return;
    var removed = state.molds[i];
    var li = $('#moldList [data-id="' + CSS.escape(id) + '"]');
    var done = function () {
      state.molds.splice(findMold(id), 1);
      saveMolds(); render();
      toast('“' + removed.name + '” eliminato', {
        action: 'Annulla',
        onAction: function () {
          state.molds.splice(Math.min(i, state.molds.length), 0, removed);
          justAdded = removed.id;
          saveMolds(); render();
        }
      });
    };
    if (li && !reduceMotion) { li.classList.add('leave'); setTimeout(done, 220); } else done();
  }

  function changeQty(id, delta) {
    var i = findMold(id);
    if (i < 0) return;
    var q = state.molds[i].qty + delta;
    if (q < C.LIMITS.qty[0] || q > C.LIMITS.qty[1]) return;
    state.molds[i].qty = q;
    haptic();
    saveMolds(); render();
  }

  function loadExample() {
    [{ name: 'Cuore', volume: 80, qty: 2 }, { name: 'Fiore', volume: 120, qty: 1 }, { name: 'Vassoio', volume: 150, qty: 1 }]
      .forEach(function (m) { state.molds.push(C.normalizeMold(Object.assign({ id: C.uid() }, m))); });
    saveMolds(); render();
    toast('Esempio caricato: 3 stampi, 4 pezzi');
  }

  function clearMolds() {
    confirmDialog({ title: 'Svuotare la colata?', message: 'Tutti gli stampi di questa colata verranno rimossi.', ok: 'Svuota', danger: true })
      .then(function (ok) {
        if (!ok) return;
        var backup = state.molds.slice();
        state.molds = [];
        saveMolds(); render();
        toast('Colata svuotata', { action: 'Annulla', onAction: function () { state.molds = backup; saveMolds(); render(); } });
      });
  }

  /* =========================================================
     Sheet stampo
     ========================================================= */

  var moldEditing = null;

  function openMoldSheet(id) {
    moldEditing = id || null;
    var m = id ? state.molds[findMold(id)] : null;
    $('#moldSheetTitle').textContent = m ? 'Modifica stampo' : 'Nuovo stampo';
    $('#moldSave').textContent = m ? 'Salva modifiche' : 'Aggiungi stampo';
    $('#moldName').value = m ? m.name : '';
    $('#moldVolume').value = m ? C.toInputValue(m.volume) : '';
    $('#moldQty').value = m ? m.qty : 1;
    $('#moldVolumeError').textContent = '';
    $('#moldVolume').classList.remove('is-invalid');
    updateMoldPreview();
    openLayer('#moldSheet', m ? null : '#moldName');
  }

  function readMoldForm() {
    var volume = C.parseNumber($('#moldVolume').value);
    var qty = C.parseNumber($('#moldQty').value, true);
    return { name: $('#moldName').value.trim(), volume: volume, qty: qty };
  }

  function updateMoldPreview() {
    var f = readMoldForm();
    var q = C.inRange(f.qty, 'qty') ? Math.floor(f.qty) : 1;
    $('#qtyMinus').disabled = q <= 1;
    $('#qtyPlus').disabled = q >= C.LIMITS.qty[1];
    $$('#nameChips .chip-s').forEach(function (b) { b.classList.toggle('is-on', b.dataset.name === f.name); });
    var pv = $('#moldPreview');
    if (C.inRange(f.volume, 'volume')) {
      var r = C.compute([{ name: 'x', volume: f.volume, qty: q }], state.settings);
      pv.innerHTML = 'Totale stampo: <b>' + C.fmtVolume(f.volume * q) + ' ml</b> · circa ' + C.fmtInt(r.powder) + ' g di polvere';
    } else {
      pv.innerHTML = 'Totale stampo: <b>— ml</b>';
    }
  }

  function submitMold() {
    var f = readMoldForm();
    var err = '';
    if (!C.inRange(f.volume, 'volume')) err = $('#moldVolume').value.trim() ? 'Inserisci un volume valido (es. 80 o 12,5).' : 'Inserisci il volume dello stampo.';
    if (err) {
      $('#moldVolumeError').textContent = err;
      $('#moldVolume').classList.add('is-invalid');
      $('#moldVolume').focus();
      return;
    }
    var qty = C.inRange(f.qty, 'qty') ? Math.floor(f.qty) : 1;
    var name = f.name || ('Stampo ' + (moldEditing ? findMold(moldEditing) + 1 : state.molds.length + 1));
    if (moldEditing) updateMold(moldEditing, { name: name, volume: f.volume, qty: qty });
    else addMold({ name: name, volume: f.volume, qty: qty });
    closeLayer('#moldSheet');
    if (!moldEditing) toast('“' + name + '” aggiunto');
  }

  function stepQty(delta) {
    var q = C.parseNumber($('#moldQty').value, true);
    q = C.inRange(q, 'qty') ? Math.floor(q) : 1;
    q = Math.max(C.LIMITS.qty[0], Math.min(C.LIMITS.qty[1], q + delta));
    $('#moldQty').value = q;
    haptic();
    updateMoldPreview();
  }

  /* =========================================================
     Impostazioni
     ========================================================= */

  var SETTING_ERRORS = {
    packPrice: 'Inserisci un prezzo valido (0 o più).',
    packGrams: 'Inserisci un peso valido in grammi.',
    ratio: 'Inserisci un rapporto valido (es. 3,5).',
    yieldMlPerKg: 'Inserisci una resa valida in ml per kg.'
  };

  function fillSettings() {
    var s = state.settings;
    $('#packPrice').value = C.toInputValue(s.packPrice);
    $('#packGrams').value = C.toInputValue(s.packGrams);
    $('#ratio').value = C.toInputValue(s.ratio);
    $('#yieldMlPerKg').value = C.toInputValue(s.yieldMlPerKg);
    $('#material').value = s.material;
    $$('[data-error-for]').forEach(function (e) { e.textContent = ''; });
    $$('[data-setting]').forEach(function (i) { i.classList.remove('is-invalid'); });
    syncSegmented();
  }

  function syncSegmented() {
    var idx = C.MARGINS.indexOf(state.settings.margin);
    $('#marginSeg').style.setProperty('--i', idx);
    $$('#marginSeg button').forEach(function (b) {
      b.setAttribute('aria-checked', String(Number(b.dataset.margin) === state.settings.margin));
      b.tabIndex = Number(b.dataset.margin) === state.settings.margin ? 0 : -1;
    });
  }

  function setMargin(m) {
    if (C.MARGINS.indexOf(m) === -1 || m === state.settings.margin) return;
    state.settings.margin = m;
    haptic();
    saveSettings(); syncSegmented(); render();
  }

  function onSettingInput(e) {
    var input = e.target, key = input.dataset.setting;
    var n = C.parseNumber(input.value, key === 'packGrams');
    var err = $('[data-error-for="' + key + '"]');
    if (C.inRange(n, key)) {
      input.classList.remove('is-invalid');
      err.textContent = '';
      if (state.settings[key] !== n) { state.settings[key] = n; saveSettings(); render(); }
    } else {
      input.classList.add('is-invalid');
      err.textContent = SETTING_ERRORS[key];
    }
  }

  function onSettingBlur(e) {
    var input = e.target, key = input.dataset.setting;
    input.value = C.toInputValue(state.settings[key]);
    input.classList.remove('is-invalid');
    $('[data-error-for="' + key + '"]').textContent = '';
  }

  function resetSettings() {
    confirmDialog({
      title: 'Ripristinare i valori predefiniti?',
      message: 'Raysin 200, rapporto 1:3,5, resa 650 ml/kg, sacco da 4000 g a 30 €, margine 10%. Stampi e storico non vengono toccati.',
      ok: 'Ripristina'
    }).then(function (ok) {
      if (!ok) return;
      state.settings = C.normalizeSettings({});
      saveSettings(); fillSettings(); render();
      toast('Valori predefiniti ripristinati');
    });
  }

  function openMarginPicker() {
    openActions('Margine per gli sprechi', C.MARGINS.map(function (m) {
      return {
        label: m + '%' + (m === 0 ? ' · nessuno' : ''),
        icon: m === state.settings.margin ? 'i-check' : null,
        fn: function () { setMargin(m); }
      };
    }));
  }

  /* =========================================================
     Storico
     ========================================================= */

  function snapshot(name) {
    var r = result;
    return {
      id: C.uid(),
      name: name,
      date: new Date().toISOString(),
      molds: r.items.map(function (m) { return { name: m.name, volume: m.volume, qty: m.qty }; }),
      settings: Object.assign({}, state.settings),
      result: {
        volume: r.volume, pieces: r.pieces, powder: r.powder, water: r.water,
        cost: r.cost, costPerPiece: r.costPerPiece, costPerKg: r.costPerKg
      }
    };
  }

  function defaultPourName() { return 'Colata del ' + C.fmtDate(new Date()); }

  function openSaveSheet() {
    if (!result.pieces) return;
    var r = result;
    $('#saveName').value = state.name.trim() || defaultPourName();
    $('#savePreview').innerHTML =
      '<div><span>Manufatti</span><b>' + r.pieces + '</b></div>' +
      '<div><span>Volume</span><b>' + C.fmtVolume(r.volume) + ' ml</b></div>' +
      '<div><span>' + esc(state.settings.material) + '</span><b>' + C.fmtInt(r.powder) + ' g</b></div>' +
      '<div><span>Acqua</span><b>' + C.fmtInt(r.water) + ' ml</b></div>' +
      '<div><span>Costo colata</span><b>' + C.fmtEuro(r.cost) + '</b></div>' +
      '<div><span>Per manufatto</span><b>' + C.fmtEuro(r.costPerPiece) + '</b></div>';
    openLayer('#saveSheet');
  }

  function submitSave() {
    var name = $('#saveName').value.trim() || defaultPourName();
    var entry = snapshot(name);
    state.history.unshift(entry);
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
    if (state.ui.view !== 'history') state.ui.unseen = (state.ui.unseen || 0) + 1;
    saveHistory(); saveUi();
    renderHistory(entry.id);
    closeLayer('#saveSheet');
    toast('Colata salvata nello storico', { action: 'Vedi', onAction: function () { switchView('history'); } });
  }

  function renderHistory(newId) {
    var h = state.history;
    var list = $('#historyList');
    list.innerHTML = h.map(function (e) {
      var r = e.result, s = C.normalizeSettings(e.settings);
      var molds = e.molds.map(function (m) { return esc(m.name) + (m.qty > 1 ? ' ×' + m.qty : ''); }).join(' · ');
      return '<li class="card h-item' + (e.id === newId ? ' enter' : '') + '" data-id="' + esc(e.id) + '">' +
        '<div class="h-top">' +
          '<div class="h-titles"><h3 class="h-name">' + esc(e.name) + '</h3><div class="h-date">' + esc(C.fmtDateTime(e.date)) + '</div></div>' +
          '<div class="h-cost"><b>' + C.fmtEuro(r.cost) + '</b><span>' + (r.pieces ? C.fmtEuro(r.cost / r.pieces) + ' / pezzo' : '') + '</span></div>' +
        '</div>' +
        '<p class="h-molds">' + molds + '</p>' +
        '<div class="h-pills">' +
          '<span class="pill">' + r.pieces + ' ' + plural(r.pieces, 'pezzo', 'pezzi') + '</span>' +
          '<span class="pill">' + C.fmtVolume(r.volume) + ' ml</span>' +
          '<span class="pill">' + C.fmtInt(r.powder) + ' g ' + esc(s.material) + '</span>' +
          '<span class="pill">' + C.fmtInt(r.water) + ' ml acqua</span>' +
          '<span class="pill muted">margine ' + s.margin + '%</span>' +
        '</div>' +
        '<div class="h-actions">' +
          '<button data-act="dup">' + icon('i-copy') + 'Duplica</button>' +
          '<button data-act="share">' + icon('i-share') + 'Condividi</button>' +
          '<button data-act="del" class="danger" aria-label="Elimina ' + esc(e.name) + '">' + icon('i-trash') + '</button>' +
        '</div>' +
      '</li>';
    }).join('');

    var has = h.length > 0;
    $('#historyEmpty').hidden = has;
    $('#historyStats').hidden = !has;
    $('#clearHistory').hidden = !has;
    if (has) {
      var t = h.reduce(function (a, e) {
        a.pieces += e.result.pieces || 0; a.powder += e.result.powder || 0; a.cost += e.result.cost || 0; return a;
      }, { pieces: 0, powder: 0, cost: 0 });
      $('#hsCount').textContent = C.fmtInt(h.length);
      $('#hsPieces').textContent = C.fmtInt(t.pieces);
      $('#hsPowder').textContent = t.powder >= 10000 ? C.fmtDecimal(t.powder / 1000, 1) + ' kg' : C.fmtInt(t.powder) + ' g';
      $('#hsCost').textContent = C.fmtEuro(t.cost);
    }
    var badge = $('#historyBadge');
    badge.hidden = !state.ui.unseen;
    badge.textContent = state.ui.unseen || '';
  }

  function findEntry(id) {
    for (var i = 0; i < state.history.length; i++) if (state.history[i].id === id) return i;
    return -1;
  }

  function duplicateEntry(id) {
    var e = state.history[findEntry(id)];
    if (!e) return;
    var apply = function () {
      state.molds = loadMolds(e.molds.map(function (m) { return Object.assign({ id: C.uid() }, m); }));
      state.name = e.name;
      $('#pourName').value = e.name;
      store.set(KEYS.name, state.name);
      saveMolds(); render();
      switchView('calc');
      toast('Lavorazione copiata nella colata, con le impostazioni attuali');
    };
    if (!state.molds.length) return apply();
    confirmDialog({ title: 'Sostituire la colata attuale?', message: 'Gli stampi della colata in corso verranno sostituiti con quelli di “' + e.name + '”.', ok: 'Sostituisci' })
      .then(function (ok) { if (ok) apply(); });
  }

  function deleteEntry(id) {
    var i = findEntry(id);
    if (i < 0) return;
    var removed = state.history[i];
    state.history.splice(i, 1);
    saveHistory(); renderHistory();
    toast('Colata eliminata', {
      action: 'Annulla',
      onAction: function () { state.history.splice(Math.min(i, state.history.length), 0, removed); saveHistory(); renderHistory(removed.id); }
    });
  }

  function clearHistory() {
    confirmDialog({
      title: 'Cancellare lo storico?',
      message: 'Verranno eliminate tutte le ' + state.history.length + ' colate salvate. L’operazione non si può annullare.',
      ok: 'Cancella', danger: true
    }).then(function (ok) {
      if (!ok) return;
      state.history = [];
      saveHistory(); renderHistory();
      toast('Storico cancellato');
    });
  }

  /* =========================================================
     Condivisione ed esportazione
     ========================================================= */

  function shareCurrent() {
    if (!result.pieces) return;
    shareTextOut(C.shareText({ name: state.name, date: new Date(), result: result, settings: state.settings }), state.name);
  }

  function shareEntry(id) {
    var e = state.history[findEntry(id)];
    if (!e) return;
    var s = C.normalizeSettings(e.settings);
    var r = Object.assign({ items: e.molds }, e.result);
    shareTextOut(C.shareText({ name: e.name, date: e.date, result: r, settings: s }), e.name);
  }

  function shareTextOut(text, title) {
    var t = 'Raysin Calculator' + (title && title.trim() ? ' · ' + title.trim() : '');
    if (navigator.share) {
      navigator.share({ title: t, text: text }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        copyText(text);
      });
    } else {
      copyText(text);
    }
  }

  function copyText(text) {
    var ok = function () { toast('Riepilogo copiato negli appunti'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, function () { legacyCopy(text) ? ok() : toast('Copia non riuscita'); });
    } else {
      legacyCopy(text) ? ok() : toast('Copia non riuscita');
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  /* ---------- backup ---------- */

  function exportBackup() {
    var data = {
      app: 'raysin-calculator', format: 1, version: APP_VERSION, exportedAt: new Date().toISOString(),
      settings: state.settings, molds: state.molds, pourName: state.name, history: state.history
    };
    var json = JSON.stringify(data, null, 2);
    var fname = 'raysin-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    var file = null;
    try { file = new File([json], fname, { type: 'application/json' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Backup Raysin Calculator' }).catch(function (err) {
        if (!err || err.name !== 'AbortError') downloadBlob(json, fname);
      });
    } else {
      downloadBlob(json, fname);
    }
  }

  function downloadBlob(text, fname) {
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('Backup scaricato');
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { data = null; }
      if (!data || data.app !== 'raysin-calculator') { toast('File non valido: non è un backup di Raysin Calculator'); return; }
      var hist = loadHistory(data.history);
      var molds = loadMolds(data.molds);
      confirmDialog({
        title: 'Importare il backup?',
        message: 'Impostazioni, ' + molds.length + ' ' + plural(molds.length, 'stampo', 'stampi') + ' e ' + hist.length + ' ' +
          plural(hist.length, 'colata', 'colate') + ' sostituiranno i dati attuali.',
        ok: 'Importa'
      }).then(function (ok) {
        if (!ok) return;
        state.settings = C.normalizeSettings(data.settings);
        state.molds = molds;
        state.history = hist;
        state.name = typeof data.pourName === 'string' ? data.pourName : '';
        $('#pourName').value = state.name;
        saveSettings(); saveMolds(); saveHistory(); store.set(KEYS.name, state.name);
        fillSettings(); render(); renderHistory();
        toast('Backup importato');
      });
    };
    reader.readAsText(file);
  }

  /* =========================================================
     Navigazione
     ========================================================= */

  function switchView(view) {
    if (['calc', 'history', 'settings'].indexOf(view) === -1) view = 'calc';
    $$('.view').forEach(function (v) {
      var on = v.id === 'view-' + view;
      v.hidden = !on;
      v.classList.toggle('is-active', on);
    });
    $$('.tab').forEach(function (t) {
      var on = t.dataset.view === view;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    if (view === 'history' && state.ui.unseen) { state.ui.unseen = 0; renderHistory(); }
    state.ui.view = view;
    saveUi();
    $('#navbarTitle').textContent = $('#view-' + view).dataset.title;
    window.scrollTo(0, 0);
    onScroll();
    if (view === 'calc') fitAll();
  }

  function onScroll() {
    $('#navbar').classList.toggle('is-visible', window.scrollY > 48);
  }

  /* =========================================================
     Sheet, action sheet, alert, toast
     ========================================================= */

  var openLayers = [];
  var lastFocus = null;

  function openLayer(sel, focusSel) {
    var layer = $(sel);
    lastFocus = document.activeElement;
    clearTimeout(layer._closeT);
    layer.classList.remove('closing');
    layer.hidden = false;
    openLayers.push(layer);
    document.documentElement.style.overflow = 'hidden';
    if (focusSel) {
      var f = $(focusSel, layer);
      if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
    } else {
      var first = $('.sheet-head .text-btn, .action-btn, button', layer);
      if (first && !('ontouchstart' in window)) first.focus({ preventScroll: true });
    }
  }

  function closeLayer(sel) {
    var layer = typeof sel === 'string' ? $(sel) : sel;
    if (!layer || layer.hidden) return;
    var i = openLayers.indexOf(layer);
    if (i >= 0) openLayers.splice(i, 1);
    if (document.activeElement && layer.contains(document.activeElement)) document.activeElement.blur();
    if (reduceMotion) { layer.hidden = true; }
    else {
      layer.classList.add('closing');
      layer._closeT = setTimeout(function () { layer.hidden = true; layer.classList.remove('closing'); }, 230);
    }
    if (!openLayers.length) document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus && !('ontouchstart' in window)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  function openActions(title, actions) {
    $('#actionTitle').textContent = title || '';
    var list = $('#actionList');
    list.innerHTML = '';
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'action-btn' + (a.danger ? ' danger' : '');
      b.innerHTML = (a.icon ? icon(a.icon) : '') + '<span>' + esc(a.label) + '</span>';
      b.addEventListener('click', function () { closeLayer('#actionSheet'); setTimeout(a.fn, reduceMotion ? 0 : 120); });
      list.appendChild(b);
    });
    openLayer('#actionSheet');
  }

  function confirmDialog(o) {
    return new Promise(function (resolve) {
      var layer = $('#alertLayer');
      $('#alertTitle').textContent = o.title;
      $('#alertMsg').textContent = o.message || '';
      var ok = $('#alertOk'), cancel = $('#alertCancel');
      ok.textContent = o.ok || 'OK';
      ok.className = o.danger ? 'strong danger' : 'strong';
      var prev = document.activeElement;
      layer.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      var finish = function (v) {
        layer.hidden = true;
        ok.onclick = cancel.onclick = null;
        document.removeEventListener('keydown', onKey, true);
        if (!openLayers.length) document.documentElement.style.overflow = '';
        if (prev && prev.focus && !('ontouchstart' in window)) { try { prev.focus({ preventScroll: true }); } catch (e) {} }
        resolve(v);
      };
      var onKey = function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
      };
      ok.onclick = function () { finish(true); };
      cancel.onclick = function () { finish(false); };
      document.addEventListener('keydown', onKey, true);
      if (!('ontouchstart' in window)) cancel.focus();
    });
  }

  var toastTimer = null;
  function toast(msg, opts) {
    opts = opts || {};
    var el = $('#toast'), btn = $('#toastAction');
    clearTimeout(toastTimer);
    $('#toastMsg').textContent = msg;
    btn.hidden = !opts.action;
    btn.textContent = opts.action || '';
    btn.onclick = opts.action ? function () { hideToast(); opts.onAction(); } : null;
    el.classList.remove('closing');
    el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    toastTimer = setTimeout(hideToast, opts.duration || (opts.action ? 5000 : 2600));
  }
  function hideToast() {
    var el = $('#toast');
    clearTimeout(toastTimer);
    if (el.hidden) return;
    el.classList.add('closing');
    setTimeout(function () { el.hidden = true; el.classList.remove('closing'); }, 200);
  }

  /* ---------- tastiera iOS: tiene gli sheet sopra la tastiera ---------- */

  function onViewport() {
    var vv = window.visualViewport;
    if (!vv) return;
    var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', (kb > 60 ? kb : 0) + 'px');
    document.documentElement.style.setProperty('--vvh', vv.height + 'px');
  }

  /* =========================================================
     Suggerimento di installazione (iOS Safari)
     ========================================================= */

  function isStandalone() {
    return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function isIOS() {
    var ua = navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  /* =========================================================
     Service worker
     ========================================================= */

  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    var updateRequested = false;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        var notify = function (worker) {
          toast('Nuova versione disponibile', {
            action: 'Aggiorna', duration: 12000,
            onAction: function () { updateRequested = true; worker.postMessage({ type: 'SKIP_WAITING' }); }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w);
          });
        });
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
      }).catch(function () {});
      // Si ricarica solo dopo un aggiornamento chiesto dall'utente, non alla prima installazione (clients.claim)
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloaded || !updateRequested) return;
        reloaded = true;
        location.reload();
      });
    });
  }

  /* =========================================================
     Eventi
     ========================================================= */

  function bind() {
    // schede
    $$('.tab').forEach(function (t) { t.addEventListener('click', function () { switchView(t.dataset.view); }); });
    window.addEventListener('scroll', onScroll, { passive: true });
    var fitT = null;
    window.addEventListener('resize', function () { clearTimeout(fitT); fitT = setTimeout(fitAll, 120); });

    // nome lavorazione
    $('#pourName').addEventListener('input', function (e) { state.name = e.target.value; store.set(KEYS.name, state.name); });
    $('#pourName').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.blur(); });

    // stampi
    $('#addMold').addEventListener('click', function () { openMoldSheet(null); });
    $('#loadExample').addEventListener('click', loadExample);
    $('#clearMolds').addEventListener('click', clearMolds);
    $('#moldList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var id = btn.closest('.mold').dataset.id;
      var act = btn.dataset.act;
      if (act === 'edit') openMoldSheet(id);
      else if (act === 'inc') changeQty(id, 1);
      else if (act === 'dec') changeQty(id, -1);
      else if (act === 'more') {
        var m = state.molds[findMold(id)];
        openActions(m.name + ' · ' + C.fmtVolume(m.volume) + ' ml × ' + m.qty, [
          { label: 'Modifica', icon: 'i-pencil', fn: function () { openMoldSheet(id); } },
          { label: 'Duplica', icon: 'i-copy', fn: function () { duplicateMold(id); } },
          { label: 'Elimina', icon: 'i-trash', danger: true, fn: function () { deleteMold(id); } }
        ]);
      }
    });

    // sheet stampo
    $('#moldForm').addEventListener('submit', function (e) { e.preventDefault(); submitMold(); });
    $('#moldSaveTop').addEventListener('click', submitMold);
    ['#moldName', '#moldVolume', '#moldQty'].forEach(function (s) {
      $(s).addEventListener('input', function () {
        if (s === '#moldVolume') { $('#moldVolumeError').textContent = ''; $('#moldVolume').classList.remove('is-invalid'); }
        updateMoldPreview();
      });
    });
    $('#moldQty').addEventListener('blur', function () {
      var q = C.parseNumber($('#moldQty').value, true);
      $('#moldQty').value = C.inRange(q, 'qty') ? Math.floor(q) : 1;
      updateMoldPreview();
    });
    $('#moldName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#moldVolume').focus(); } });
    $('#qtyMinus').addEventListener('click', function () { stepQty(-1); });
    $('#qtyPlus').addEventListener('click', function () { stepQty(1); });
    $('#nameChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-name]');
      if (!b) return;
      $('#moldName').value = b.dataset.name;
      updateMoldPreview();
      if (!$('#moldVolume').value) $('#moldVolume').focus();
    });

    // risultato
    $('#saveBtn').addEventListener('click', openSaveSheet);
    $('#shareBtn').addEventListener('click', shareCurrent);
    $('#marginChip').addEventListener('click', openMarginPicker);
    $('#saveForm').addEventListener('submit', function (e) { e.preventDefault(); submitSave(); });
    $('#saveConfirmTop').addEventListener('click', submitSave);

    // storico
    $('#historyList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var id = btn.closest('.h-item').dataset.id;
      if (btn.dataset.act === 'dup') duplicateEntry(id);
      else if (btn.dataset.act === 'share') shareEntry(id);
      else if (btn.dataset.act === 'del') deleteEntry(id);
    });
    $('#clearHistory').addEventListener('click', clearHistory);

    // impostazioni
    $('#marginSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-margin]');
      if (b) setMargin(Number(b.dataset.margin));
    });
    $('#marginSeg').addEventListener('keydown', function (e) {
      var i = C.MARGINS.indexOf(state.settings.margin);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = Math.min(C.MARGINS.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = Math.max(0, i - 1);
      else return;
      e.preventDefault();
      setMargin(C.MARGINS[i]);
      $('#marginSeg [aria-checked="true"]').focus();
    });
    $$('[data-setting]').forEach(function (inp) {
      inp.addEventListener('input', onSettingInput);
      inp.addEventListener('blur', onSettingBlur);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
    });
    $('#material').addEventListener('input', function (e) {
      var v = e.target.value.trim();
      state.settings.material = v || C.DEFAULTS.material;
      saveSettings(); render(); renderHistory();
    });
    $('#material').addEventListener('blur', function (e) { e.target.value = state.settings.material; });
    $('#material').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.blur(); });
    $('#resetSettings').addEventListener('click', resetSettings);
    $('#exportBackup').addEventListener('click', exportBackup);
    $('#importBackup').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importBackup(f);
      e.target.value = '';
    });

    // livelli
    $$('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { closeLayer(b.closest('.sheet-layer')); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && openLayers.length) closeLayer(openLayers[openLayers.length - 1]);
    });

    // suggerimento di installazione
    $('#installHintClose').addEventListener('click', function () {
      state.ui.hintClosed = true; saveUi(); $('#installHint').hidden = true;
    });

    // tastiera iOS
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewport);
      window.visualViewport.addEventListener('scroll', onViewport);
    }

    // sincronizza più schede aperte
    window.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf('raysin.') !== 0) return;
      state.settings = C.normalizeSettings(store.get(KEYS.settings, {}));
      state.molds = loadMolds(store.get(KEYS.molds, []));
      state.history = loadHistory(store.get(KEYS.history, []));
      fillSettings(); render(); renderHistory();
    });
  }

  /* =========================================================
     Avvio
     ========================================================= */

  function init() {
    $('#appVersion').textContent = 'v' + APP_VERSION;
    $('#pourName').value = state.name;
    $('#installHint').hidden = !(isIOS() && !isStandalone() && !state.ui.hintClosed);
    fillSettings();
    bind();
    render();
    renderHistory();
    switchView(state.ui.view);
    onViewport();
    registerSW();

    // aggancio per i test automatici (sola lettura)
    window.__raysin = {
      version: APP_VERSION,
      get result() { return result; },
      get state() { return JSON.parse(JSON.stringify(state)); }
    };
  }

  init();
})();
