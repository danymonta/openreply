# Migrazione ManyChat → OpenReply (Percorso Alpha)

Inventario letto da ManyChat il 30/10/2026 (account @_danymonta, 8.237 contatti, piano PRO).
Legenda trigger: **C** = commento su qualsiasi post/reel · **S** = risposta a una Storia · **DM** = messaggio che inizia con… · numeri = esecuzioni totali.

## 1. Automazioni attive (LIVE)

### Cartella principale
| Automazione | Trigger e parole | Esecuzioni | In OpenReply |
|---|---|---|---|
| Say hi to new followers | **Nuovo follower** → "Hei ciao! Grazie per il follow e il supporto! Per curiosità, cosa ti ha spinto a seguirmi?" | 166 | ❌ manca il trigger "follow" (vedi §3) |
| Reply to story "GUIDA" | S: GUIDE, GUIDA · DM: GUIDA, GUIDE, EBOOK | 363 | ✅ trigger DM/Storia |
| Reply to story "DIETA" | S: DIETA · DM: DIETA | 191 | ✅ |
| Comment "SITO" (sito calorie) | C: SITO | 141 | ✅ |
| Reply to story "ATTREZZI" | S: Attrezzi, ATTREZZO · DM: ATTREZZI, ATTREZZO, Tool, Tools | 44 | ✅ |
| Comment "TOOL" (lista attrezzi) | C: Attrezzi, tool, Tools · DM: Tool, Tools | 168 | ✅ |

### Cartella "Comment for GUIDE" (tutte C)
| Automazione | Parole | Esecuzioni |
|---|---|---|
| ELASTICI – guida esercizi elastico | elastici, elastico | 5 |
| PECTUS – video pectus | pectus | 90 |
| CALCOLATORE | CALCOLATORE | 348 |
| QUIZ – quiz pectus | QUIZ | 10 |
| PECTUS guide MESSANGER | ADDOME | 0 |
| METODO – lezione gratuita | METODO | 154 |
| ESERCIZI – top 10 (messanger) | ESERCIZI | 20 |
| ESERCIZI – top 10 | ESERCIZI | 55 |
| GUIDA – guida gratuita | GUIDA, EBOOK, GUIDE · DM: SCHEDA | 1.649 |
| TEST – quiz Problem Driven | TEST | 9 |
| TRACKER | TRACKER | 3 |
| RISCALDAMENTO – video | RISCALDAMENTO | 7 |
| CHECKLIST – lezione | CHECKLIST | 18 |
| ADDOME – addome 90gg | ADDOME | 55 |
| GUIDA guide MESSANGER | GUIDA | 86 |
| ADDOME guide MESSANGER | ADDOME | 21 |
| METODO guide MESSANGER | METODO | 18 |
| DIETA – guida dieta | Dieta | 43 |
| DIETA guide MESSANGER copy | DIETA | 34 |

⚠️ **Parole doppie**: GUIDA, ADDOME (3 automazioni), METODO, ESERCIZI, DIETA sono usate da due automazioni (la normale e la "MESSANGER"). Su Instagram un commento può ricevere **una sola** risposta privata: in OpenReply va tenuta una campagna per parola. Da decidere quale tenere (le "MESSANGER" hanno CTR 1–10%, le normali 70–90%).

### Cartella "Richiesta di percorso" (vendita coaching)
| Automazione | Trigger | Esecuzioni | In OpenReply |
|---|---|---|---|
| INFO COACHING 1:1 ALPHA | **Conversation Starter** "Voglio sapere come funziona il tuo Percorso" · DM: PRONTO, Coaching, Coach, ALPHA · S: Inizio, Coaching, Coach, ALPHA | 570 | 🟡 DM/Storia sì; Conversation Starter e messaggi multipli no |
| Comment "ALPHA" per Coaching 1:1 | C: ALPHA, ALFA | 2 | ✅ |

### Cartella "Story reply" (tutte S, alcune anche DM)
| Automazione | Parole | Esecuzioni |
|---|---|---|
| PECTUS – video lezione | DM: PECTUS | 17 |
| QUIZ – quiz pectus | S + DM: QUIZ | 30 |
| CIBO – guida calorie fuori casa | S: CIBO | 5 |
| TEST – test gratuito | S: TEST | 12 |
| PERCORSO – case study Simone | S: DOC | 15 |
| METODO – lezione gratuita | S: Metodo | 15 |
| CHECKLIST | S + DM: CHECKLIST, check-list | 3 |
| ADDOME – addominali 90gg | S + DM: ADDOME | 21 |
| TRAZIONE – guida pull-up | S + DM: TRAZIONI, TRAZIONE, PULLUP, ebook | 373 |

### Ferme (STOPPED) – non da migrare salvo tua richiesta
Convert comments into sales (DIET, post specifico) · Comment TRAZIONE · Reply story RISCALDAMENTO · Reply story METODO 74kg · 1 bozza "Untitled".

## 2. Com'è fatto un flusso tipico (esempio: CALCOLATORE)
1. DM di apertura: "🎉 Ciao {Nome}! Grazie per il tuo interesse. Sei pronto a scoprire il nostro calcolatore gratuito?" + pulsante **"Sì, voglio il link"** → ✅ OpenReply (opening DM + pulsante)
2. **Controllo follow**: se non ti segue → "⚠️ Per favore, seguimi su Instagram per ricevere il link!" + pulsante "Ho seguito!" che ricontrolla → ✅ OpenReply (follow gate)
3. Invio link → ✅ (link tracciato con clic)
4. Messaggio "Inserisci il tuo peso…" → 🟡 OpenReply ha **un solo** follow-up
5. Domanda "Qual è la cosa che ti blocca di più oggi…?" → 🟡 si può mandare, ma la risposta finisce solo nell'inbox (niente salvataggio in un campo)

INFO COACHING invia 3 messaggi di fila con 5 secondi di pausa, poi la conversazione la prende il setter → 🟡 OpenReply oggi manda un messaggio unico.

## 3. Cosa manca in OpenReply (da sviluppare se vuoi il "paro paro")
| # | Funzione ManyChat | Usata in | Fattibilità |
|---|---|---|---|
| 1 | **Trigger "nuovo follower"** | Say hi to new followers | Da verificare: va capito se Meta lo concede anche alle app normali o solo ai partner come ManyChat (richiesta aperta nel progetto: issue #78). Se Meta non lo espone, non si può fare con l'API ufficiale. |
| 2 | **Più messaggi in sequenza con pause** | INFO COACHING, CALCOLATORE e altri | ✅ Fattibile nel codice (catena di messaggi con ritardo) |
| 3 | **{Nome}** oltre a {username} | quasi tutti | ✅ Fattibile se il profilo Instagram restituisce il nome |
| 4 | **Conversation Starters** (domande rapide nel profilo) | INFO COACHING | ✅ Fattibile (API "ice breakers" di Meta) |
| 5 | Domanda con risposta salvata in un campo | CALCOLATORE | 🟡 Fattibile, più lavoro |
| 6 | Lista contatti con tag e statistiche per contatto | Contatti (8.237) | 🟡 Fattibile: OpenReply salva già chi ha ricevuto cosa; serve una pagina "Contatti" |

## 4. Piano proposto
1. Ricreare in OpenReply le automazioni ✅ (una campagna per parola chiave, stessi testi e link), lasciandole **in pausa**.
2. Sviluppare #2 e #3 (sequenze e nome): coprono quasi tutti i tuoi flussi.
3. Verificare #1 (follower) e, se Meta lo consente, svilupparlo.
4. Test con l'account @danymonta.raw su 2–3 automazioni.
5. Cambio: scollegare ManyChat, dare a OpenReply il controllo delle conversazioni in Meta Business Suite, attivare le campagne. ManyChat resta pagato fino a fine mese come paracadute.
