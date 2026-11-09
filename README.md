# Raysin Calculator

Web app progressiva (PWA) per calcolare **Raysin 200, acqua e costi** delle colate negli stampi in silicone.
È pensata prima di tutto per iPhone e si installa sulla schermata Home. Funziona offline, non ha account né backend: tutti i dati restano sul dispositivo.

## Funzioni

- **I tuoi stampi**: aggiungi, modifica, duplica ed elimina gli stampi (con nome, volume in ml e copie), con il volume totale e il numero di pezzi. Dopo un'eliminazione puoi annullare.
- **Risultato della tua colata**: volume, pezzi, grammi di Raysin, ml di acqua, costo della colata, costo per manufatto, costo al kg, colate possibili con un sacco e un riepilogo scritto. Tutto si aggiorna mentre scrivi.
- **Impostazioni**: margine per gli sprechi (0, 5, 10 o 15%), prezzo e peso del sacco, nome del materiale, rapporto acqua:polvere, resa volumetrica. Salvataggio automatico, ripristino dei valori predefiniti, backup in JSON da esportare e importare.
- **Storico**: salvi le colate con nome, data e ora, quantità e costi. Puoi duplicarle, condividerle, eliminarle e cancellare tutto lo storico (con conferma). In alto ci sono i totali.
- **Condivisione**: Web Share API di iOS (Messaggi, Note, Mail…); se non è disponibile, il riepilogo viene copiato negli appunti.
- **PWA**: manifest, service worker con precache, funzionamento offline, icone 192, 512, maskable e Apple Touch, modalità standalone, safe area (notch e Dynamic Island).

## Formule

Il volume totale **V** è la somma di volume × copie di ogni stampo. Il fattore di margine è **F = 1 + margine / 100**.

| Grandezza | Formula | Con i valori predefiniti |
|---|---|---|
| Polvere (g) | V ÷ (resa ÷ 1000) × F | V ÷ 0,65 × F |
| Acqua (ml) | Polvere ÷ rapporto | Polvere ÷ 3,5 |
| Costo al grammo | Prezzo sacco ÷ grammi sacco | 30 ÷ 4000 = 0,0075 € |
| Costo colata | Polvere × costo al grammo | |
| Costo per pezzo | Costo colata ÷ **numero di manufatti** (somma delle copie) | |
| Colate per sacco | Grammi sacco ÷ polvere | |

I calcoli usano sempre i valori non arrotondati. Si arrotonda solo quando i valori vengono mostrati: grammi e ml interi, euro con due decimali, volumi con un decimale quando serve.
La resa di 650 ml/kg indica il **volume** dell'impasto e non va confusa con la somma dei pesi di acqua e polvere.

### Caso di prova

| Stampo | Volume | Copie | Totale |
|---|---|---|---|
| A | 80 ml | 2 | 160 ml |
| B | 120 ml | 1 | 120 ml |
| C | 150 ml | 1 | 150 ml |

Volume 430 ml · margine 10% · sacco da 4000 g a 30 € →
**728 g** di Raysin · **208 ml** di acqua · **5,46 €** a colata · **4** pezzi · **1,36 €** a pezzo · 5,5 colate per sacco.

> Sul costo per pezzo: 5,4577 € ÷ 4 = 1,3644 €, che arrotondato fa **1,36 €**. Il valore "circa 1,37 €" nasce dal dividere il costo già arrotondato (5,46 ÷ 4 = 1,365). L'app usa i valori non arrotondati, come richiesto, quindi mostra 1,36 €.

## Struttura

```
RAYSIN/
├── index.html              App (tre schede: Colata, Storico, Impostazioni)
├── manifest.json           Manifest PWA
├── sw.js                   Service worker (precache, offline, aggiornamenti)
├── .nojekyll               Per GitHub Pages: serve i file così come sono
├── css/styles.css          Stile (palette lavanda/viola, safe area, responsive)
├── js/calc.js              Motore di calcolo (funzioni pure, usato anche dai test)
├── js/app.js               Interfaccia, localStorage, storico, condivisione, backup
├── icons/                  icon-192, icon-512, icon-maskable-512, apple-touch-icon (180), favicon-32, icon-1024
├── tools/
│   ├── icon.svg            Disegno sorgente dell'icona
│   ├── make_icons.sh       Rigenera i PNG delle icone (macOS)
│   ├── serve.py            Server locale senza cache
│   └── webkit_run.swift    Harness WebKit headless per i test (macOS)
└── tests/
    ├── calc.test.js        Test del motore di calcolo (node)
    ├── ui.test.js          Test dell'interfaccia in WebKit (lo stesso motore di Safari)
    ├── pwa.test.js         Manifest, icone, service worker, offline
    └── run_all.sh          Esegue tutti i controlli
```

Lo stack è HTML, CSS e JavaScript senza dipendenze e senza build: quello che c'è nella cartella è quello che viene pubblicato.

## Avvio in locale

```bash
cd ~/Desktop/RAYSIN
python3 tools/serve.py          # poi apri http://localhost:8080
```

Il service worker funziona solo su `http://localhost` o in HTTPS. Aprendo `index.html` con doppio clic (`file://`) l'app funziona, ma senza modalità offline.

Per provarla sull'iPhone nella stessa rete Wi-Fi c'è `python3 tools/serve.py 8080 --lan`, che mostra l'indirizzo da aprire in Safari. Senza HTTPS però iOS non attiva l'offline: per l'installazione vera usa GitHub Pages.

## Test

```bash
tests/run_all.sh
```

Controlla la sintassi, i riferimenti ai file e il motore di calcolo (69 controlli). Poi prova l'interfaccia in WebKit a 320, 375, 390, 430, 768 e 1280 px (85 controlli per ogni misura: caso di prova, aggiornamento dinamico, stampi, impostazioni e loro persistenza, storico, condivisione, layout, nessun errore JavaScript). Infine verifica la PWA, offline compreso (30 controlli). Serve un Mac con node, python3 e Xcode Command Line Tools.

## Pubblicazione su GitHub Pages

1. Crea un repository su GitHub, per esempio `raysin-calculator`, pubblico oppure privato con un piano che preveda Pages.
2. Dalla cartella del progetto:
   ```bash
   cd ~/Desktop/RAYSIN
   git init
   git add .
   git commit -m "Raysin Calculator 1.0.0"
   git branch -M main
   git remote add origin https://github.com/<utente>/raysin-calculator.git
   git push -u origin main
   ```
3. Su GitHub apri **Settings → Pages**, scegli **Source: Deploy from a branch**, poi **Branch: main** e **/ (root)**, e salva.
4. Dopo circa un minuto l'app è su `https://<utente>.github.io/raysin-calculator/`.

Tutti i percorsi sono relativi (`./`), quindi l'app funziona anche in una sottocartella senza configurazioni.

### Pubblicare un aggiornamento

1. Modifica i file.
2. Aumenta la versione in **due punti**: `VERSION` in `sw.js` e `APP_VERSION` in `js/app.js`, per esempio `1.0.1`.
3. `git commit -am "…" && git push`.

Alla riapertura l'app mostra "Nuova versione disponibile · Aggiorna". I dati salvati (impostazioni, stampi, storico) restano.

## Installazione sull'iPhone

1. Apri l'indirizzo GitHub Pages in **Safari**.
2. Tocca **Condividi** (il quadrato con la freccia in su). Se nella barra non lo vedi, cercalo nel menu **···**.
3. Scegli **Aggiungi alla schermata Home** e lascia attiva l'opzione **Apri come app web**, se compare.
4. Conferma il nome **Raysin** e tocca **Aggiungi**.

L'icona lavanda con il fiore compare sulla Home. Da lì l'app si apre a tutto schermo, senza la barra di Safari, e funziona anche offline.
Il primo avvio da Safari mostra un suggerimento con questi passaggi, che si può chiudere.

> I dati della web app installata sono separati da quelli di Safari. Per spostarli usa **Impostazioni → Esporta backup** e poi **Importa backup**.

## Checklist di verifica

**Calcoli**
- [ ] Caso di prova: 728 g, 208 ml, 5,46 €, 4 pezzi, 1,36 € a pezzo
- [ ] Il costo per pezzo divide per il numero di manufatti (4), non per le tipologie di stampo (3)
- [ ] Margine 0, 5, 10, 15%: la polvere cambia (662, 695, 728, 761 g)
- [ ] Prezzo, peso del sacco, rapporto e resa modificati: i risultati si aggiornano subito
- [ ] Valori non validi (testo, zero, negativi): messaggio d'errore, il calcolo resta sull'ultimo valore valido

**Stampi**
- [ ] Aggiungi, modifica (tocca il nome), duplica ed elimina (menu ···), poi Annulla
- [ ] Le copie si cambiano con − e + direttamente nell'elenco
- [ ] Il totale mostra il volume e il numero complessivo di pezzi

**Dati**
- [ ] Chiudi e riapri l'app: impostazioni, stampi e nome lavorazione sono ancora lì
- [ ] Ripristina valori predefiniti: chiede conferma e non tocca stampi né storico
- [ ] Storico: salva, duplica, condividi, elimina con Annulla, cancella tutto con conferma
- [ ] Backup: esporta e importa un file JSON

**iPhone e PWA**
- [ ] Installata dalla schermata Home: si apre senza la barra di Safari
- [ ] Contenuti non coperti da notch, Dynamic Island e indicatore Home
- [ ] Modalità aereo: l'app si apre e calcola
- [ ] Condividi apre il foglio di condivisione di iOS
- [ ] Toccando i campi la pagina non si ingrandisce (testo almeno 16 px) e gli sheet restano sopra la tastiera
- [ ] iPhone SE (320/375 px): niente scorrimento orizzontale
- [ ] iPad e desktop: layout su due colonne e barra delle schede flottante

## Note

- La resa di 650 ml/kg è indicativa. Conviene misurarla sui propri stampi (riempi d'acqua, pesa: 1 g ≈ 1 ml) e correggerla nelle Impostazioni.
- L'app non invia dati in rete e non usa font, librerie o servizi esterni.
- Il colore tema del manifest è il viola #6845D9. Nella pagina la barra di stato di iOS resta chiara (#F8F7FB), in tinta con lo sfondo.
- Per rigenerare le icone dopo aver modificato `tools/icon.svg`: `tools/make_icons.sh` (macOS).
