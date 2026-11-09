/*!
 * Raysin Calculator · motore di calcolo
 * Funzioni pure, senza DOM: usate dall'app (window.RaysinCalc) e dai test (Node).
 *
 * Formule (V = volume totale stampi in ml, F = 1 + margine/100):
 *   Polvere (g)        = V / (resa ml/kg / 1000) × F        → con 650 ml/kg: V / 0,65 × F
 *   Acqua (ml)         = Polvere / rapporto                  → con 1:3,5: Polvere / 3,5
 *   Costo al grammo    = Prezzo confezione / Grammi confezione
 *   Costo colata       = Polvere × Costo al grammo
 *   Costo per pezzo    = Costo colata / Numero di manufatti (somma delle quantità)
 *   Colate per sacco   = Grammi confezione / Polvere
 * Tutti i calcoli usano valori NON arrotondati; si arrotonda solo in visualizzazione.
 */
(function (root) {
  'use strict';

  var DEFAULTS = Object.freeze({
    material: 'Raysin 200',
    margin: 10,          // % di scarto
    packPrice: 30,       // € per confezione
    packGrams: 4000,     // g per confezione
    ratio: 3.5,          // parti di polvere per 1 parte di acqua (in peso)
    yieldMlPerKg: 650    // ml di impasto per 1 kg di polvere (resa indicativa)
  });

  var MARGINS = Object.freeze([0, 5, 10, 15]);

  var LIMITS = Object.freeze({
    volume: [0.1, 100000],
    qty: [1, 999],
    packPrice: [0, 100000],
    packGrams: [1, 1000000],
    ratio: [0.1, 100],
    yieldMlPerKg: [1, 10000]
  });

  /* ---------- parsing ---------- */

  /**
   * Converte un input utente in numero. Accetta la virgola decimale italiana ("3,5"),
   * spazi e unità ("30 €", "80 ml"). Con integer=true accetta anche "4.000" come 4000.
   * Restituisce NaN se il testo non è un numero valido.
   */
  function parseNumber(value, integer) {
    if (typeof value === 'number') return isFinite(value) ? value : NaN;
    if (value === null || value === undefined) return NaN;
    var s = String(value).trim().replace(/\s+/g, '').replace(/€|ml|kg|g/gi, '');
    if (s === '') return NaN;
    if (integer && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (s.indexOf(',') !== -1) {
      s = s.replace(/\.(?=\d{3}(?:,|$))/g, '');   // "1.234,5" → "1234,5"
      s = s.replace(',', '.');
    }
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
    return parseFloat(s);
  }

  function inRange(n, key) {
    var l = LIMITS[key];
    return typeof n === 'number' && isFinite(n) && n >= l[0] && n <= l[1];
  }

  /* ---------- normalizzazione ---------- */

  function normalizeSettings(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var s = {};
    var mat = typeof r.material === 'string' ? r.material.trim().slice(0, 30) : '';
    s.material = mat || DEFAULTS.material;
    var m = parseNumber(r.margin);
    s.margin = MARGINS.indexOf(m) !== -1 ? m : DEFAULTS.margin;
    ['packPrice', 'packGrams', 'ratio', 'yieldMlPerKg'].forEach(function (k) {
      var n = parseNumber(r[k]);
      s[k] = inRange(n, k) ? n : DEFAULTS[k];
    });
    return s;
  }

  function normalizeMold(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var volume = parseNumber(raw.volume);
    var qty = parseNumber(raw.qty);
    if (!inRange(volume, 'volume')) return null;
    if (!inRange(qty, 'qty') || Math.floor(qty) !== qty) return null;
    var name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      name: name || 'Stampo',
      volume: volume,
      qty: qty
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- calcolo ---------- */

  function compute(molds, settings) {
    var s = normalizeSettings(settings);
    var items = [];
    (molds || []).forEach(function (m) {
      var n = normalizeMold(m);
      if (n) items.push({ id: n.id, name: n.name, volume: n.volume, qty: n.qty, total: n.volume * n.qty });
    });

    var volume = items.reduce(function (a, m) { return a + m.total; }, 0);
    var pieces = items.reduce(function (a, m) { return a + m.qty; }, 0);
    var factor = 1 + s.margin / 100;
    var mlPerGram = s.yieldMlPerKg / 1000;                 // 650 ml/kg → 0,65 ml/g
    var powder = volume > 0 ? (volume / mlPerGram) * factor : 0;
    var water = powder / s.ratio;
    var costPerGram = s.packPrice / s.packGrams;
    var cost = powder * costPerGram;
    var costPerPiece = pieces > 0 ? cost / pieces : null;
    var castsPerPack = powder > 0 ? s.packGrams / powder : null;

    return {
      items: items,
      molds: items.length,
      volume: volume,
      pieces: pieces,
      factor: factor,
      powder: powder,
      water: water,
      mix: powder + water,                                  // peso dell'impasto (g), NON il volume
      costPerGram: costPerGram,
      costPerKg: costPerGram * 1000,
      cost: cost,
      costPerPiece: costPerPiece,
      castsPerPack: castsPerPack,
      fullCasts: castsPerPack === null ? null : Math.floor(castsPerPack + 1e-9),
      packsNeeded: powder > 0 ? Math.ceil(powder / s.packGrams - 1e-9) : 0,
      settings: s
    };
  }

  /* ---------- formattazione (it-IT) ---------- */

  var nfCache = {};
  function nf(min, max, grouping) {
    var k = min + '-' + max + '-' + (grouping ? 1 : 0);
    if (!nfCache[k]) {
      nfCache[k] = new Intl.NumberFormat('it-IT', {
        minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping !== false
      });
    }
    return nfCache[k];
  }
  var eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function fmtInt(v) { return nf(0, 0).format(Math.round(v) || 0); }            // grammi, ml interi
  function fmtVolume(v) { return nf(0, 1).format(v || 0); }                     // un decimale se serve
  function fmtDecimal(v, max) { return nf(0, max === undefined ? 2 : max).format(v || 0); }
  function fmtEuro(v) { return eurFmt.format(v || 0); }                         // "5,46 €"
  function fmtEuroPrecise(v) { return nf(2, 4).format(v || 0) + '\u00a0€'; }

  var dtFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var dFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  function fmtDateTime(d) { return dtFmt.format(new Date(d)); }
  function fmtDate(d) { return dFmt.format(new Date(d)); }

  /** Valore da mostrare dentro un campo di input (virgola decimale, senza separatori di migliaia). */
  function toInputValue(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    return String(Math.round(n * 10000) / 10000).replace('.', ',');
  }

  /* ---------- testi ---------- */

  function summaryText(r) {
    var s = r.settings;
    if (!r.pieces) return 'Aggiungi almeno uno stampo per calcolare quantità e costi della tua colata.';
    var who = r.pieces === 1 ? 'il tuo manufatto' : 'i tuoi ' + r.pieces + ' manufatti';
    var t = 'Per realizzare ' + who + ', con un volume totale di ' + fmtVolume(r.volume) + ' ml, dovrai utilizzare circa ' +
      fmtInt(r.powder) + ' g di ' + s.material + ' e ' + fmtInt(r.water) + ' ml di acqua. ';
    t += 'Il costo stimato della colata è di ' + fmtEuro(r.cost);
    t += r.pieces > 1 ? ', pari a ' + fmtEuro(r.costPerPiece) + ' per manufatto.' : '.';
    t += s.margin > 0 ? ' Il calcolo include un margine del ' + s.margin + '% per gli sprechi.' : ' Nessun margine per gli sprechi applicato.';
    return t;
  }

  /**
   * Riepilogo testuale da condividere.
   * opts: { name, date, result, settings }  (result da compute o snapshot dello storico)
   */
  function shareText(opts) {
    var r = opts.result, s = opts.settings || r.settings;
    var L = [];
    L.push('Raysin Calculator');
    L.push('Lavorazione: ' + (opts.name && opts.name.trim() ? opts.name.trim() : 'Colata senza nome'));
    if (opts.date) L.push('Data: ' + fmtDateTime(opts.date));
    L.push('');
    L.push('Stampi utilizzati:');
    (r.items || []).forEach(function (m) {
      L.push('• ' + m.name + ': ' + fmtVolume(m.volume) + ' ml × ' + m.qty + ' = ' + fmtVolume(m.volume * m.qty) + ' ml');
    });
    L.push('');
    L.push('Volume totale: ' + fmtVolume(r.volume) + ' ml');
    L.push('Manufatti: ' + r.pieces);
    L.push(s.material + ': ' + fmtInt(r.powder) + ' g');
    L.push('Acqua: ' + fmtInt(r.water) + ' ml');
    L.push('Margine applicato: ' + s.margin + '%');
    L.push('');
    L.push('Costo totale: ' + fmtEuro(r.cost));
    if (r.pieces) L.push('Costo per manufatto: ' + fmtEuro(r.cost / r.pieces));
    L.push('');
    L.push('Parametri: acqua:polvere 1:' + fmtDecimal(s.ratio) + ' · resa ' + fmtInt(s.yieldMlPerKg) + ' ml/kg · confezione ' +
      fmtInt(s.packGrams) + ' g a ' + fmtEuro(s.packPrice));
    return L.join('\n');
  }

  var api = {
    DEFAULTS: DEFAULTS,
    MARGINS: MARGINS,
    LIMITS: LIMITS,
    parseNumber: parseNumber,
    inRange: inRange,
    normalizeSettings: normalizeSettings,
    normalizeMold: normalizeMold,
    uid: uid,
    compute: compute,
    fmtInt: fmtInt,
    fmtVolume: fmtVolume,
    fmtDecimal: fmtDecimal,
    fmtEuro: fmtEuro,
    fmtEuroPrecise: fmtEuroPrecise,
    fmtDateTime: fmtDateTime,
    fmtDate: fmtDate,
    toInputValue: toInputValue,
    summaryText: summaryText,
    shareText: shareText
  };

  root.RaysinCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
