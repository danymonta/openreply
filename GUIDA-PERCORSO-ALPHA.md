# OpenReply per Percorso Alpha — guida completa

Sostituto self-hosted di ManyChat per Instagram: commento con parola chiave → DM automatico, risposte alle Storie, risposta pubblica al commento, link tracciati. Usa **solo l'API ufficiale di Meta** (Instagram API con Instagram Login): niente scraping, niente browser automatizzati, nessuna password Instagram.

---

## 1. Verdetto della revisione (24 ottobre 2026)

**Approvato, con correzioni di sicurezza già applicate in questa copia.**

| Aspetto | Esito |
| --- | --- |
| API usata | ✅ Ufficiale Meta (`graph.instagram.com`, private replies, webhook). Nessuno scraping. |
| Licenza | ✅ MIT: puoi usarlo e modificarlo anche a scopo commerciale. |
| Attività | ✅ ~2.800 stelle, 190 commit, ultimo merge 5 ottobre 2026. ⚠️ Da inizio ottobre molte PR restano in attesa: il manutentore è rallentato, quindi gli aggiornamenti di sicurezza vanno fatti anche da noi (vedi §8). |
| Firma webhook | ✅ HMAC-SHA256 su `X-Hub-Signature-256` con app secret, confronto a tempo costante; senza firma valida → 401. |
| Token Instagram | ✅ Cifrati nel database con AES-256-GCM (`ENCRYPTION_KEY`). |
| OAuth | ✅ `state` firmato con HMAC e scadenza a 10 minuti. |
| Accesso al pannello | ✅ Tutte le API controllano sessione e workspace. ⚠️ Di default **chiunque** può registrarsi: qui è bloccato con `ALLOWED_EMAILS`. |
| Segreti nel repo | ✅ Nessuno, nemmeno nella cronologia git. |
| Dipendenze | ❌ Nel repo originale: Next.js 16.2.6 con RCE non autenticate note, Auth.js con bypass, Node 20 (fuori supporto, senza patch). **Corretto qui**: Next.js 16.4.3, Auth.js beta.32, Node 24. Resta un avviso su `nodemailer` (nessuna versione compatibile corretta): in produzione usi Resend, quindi nodemailer non invia nulla. |

### Confronto rapido con le alternative

- **ChatbotX** (github.com/ChatbotXIO/ChatbotX): costruttore di flussi più ampio (più canali, stile ManyChat completo), ma più pesante da ospitare e mantenere. Ha senso solo se ti servono flussi conversazionali complessi.
- **ZernFlow / Zernio**: Zernio è il servizio *a pagamento* che sponsorizza OpenReply; evita di creare la tua app Meta, ma reintroduce un costo mensile e un terzo che vede i tuoi messaggi. Con un solo account (il tuo) non serve: l'app Meta tua non richiede App Review.
- **OpenReply** fa esattamente comment-to-DM + Storie + link tracciati, è leggero, ed è la scelta giusta per il tuo caso.

---

## 2. Cosa ho cambiato rispetto all'originale

Branch git `percorso-alpha/hardening` (nessun commit ancora fatto):

- `package.json` / `package-lock.json`: Next.js 16.4.3, next-auth 5.0.0-beta.32, @auth/prisma-adapter 2.11.3 + `npm audit fix` (da 4 critiche + 12 alte a 0 critiche).
- `Dockerfile`: `node:20-slim` → `node:24-slim`.
- `compose.selfhost.yml`: stack completo (Postgres, Redis con password, migrazioni, web, worker, cron, Mailpit in locale, Caddy HTTPS in produzione). Postgres e Redis **non** sono esposti fuori da Docker; il pannello ascolta solo su `127.0.0.1`.
- `deploy/Caddyfile`: HTTPS automatico Let's Encrypt + header di sicurezza.
- `lib/utils/rate-limiter.ts`: nuovi `DM_RATE_LIMIT_PER_HOUR` (margine sotto il tetto Meta, impostato a 300/ora) e `DM_MAX_REQUEUE_ATTEMPTS` (nei picchi i DM in eccesso restano in coda fino a 24 ore invece di essere scartati dopo ~1,5 ore).
- `scripts/start.sh`: un solo punto di avvio; `OPENREPLY_ROLE=web|worker|cron` sceglie il processo (il web applica prima le migrazioni).
- `.env` (non tracciato, permessi 600) con segreti casuali generati; `.env.example` aggiornato.

---

## 3. Avvio in locale (Mac, Docker/OrbStack)

```bash
cd ~/Developer/openreply
open -a OrbStack
docker compose -f compose.selfhost.yml --profile local up -d --build
```

- Pannello: http://localhost:3000 → accedi con la tua email.
- Il link di accesso **non** arriva nella tua casella: lo trovi in Mailpit, http://localhost:8025.
- Stato: http://localhost:3000/api/health
- Log: `docker compose -f compose.selfhost.yml logs -f web worker`
- Stop: `docker compose -f compose.selfhost.yml --profile local down` (aggiungi `-v` solo se vuoi cancellare il database locale).

**Verificato il 24/10/2026:** typecheck OK e 322 test del progetto superati su Node 24 con le dipendenze aggiornate; `/api/health` tutto `ok` (database, Redis, coda, worker); senza login il pannello rimanda a `/login` e le API rispondono 401; webhook senza firma → 401; cron senza segreto → 401; login con magic link via Mailpit → accesso al pannello riuscito; email non presente in `ALLOWED_EMAILS` → rifiutata (mostra una pagina d'errore generica invece di un messaggio chiaro: comportamento del progetto originale, solo estetico).

**Limite del locale:** Meta deve raggiungere il webhook su un URL pubblico HTTPS, quindi i commenti veri arrivano solo in produzione. In locale puoi provare il pannello e creare campagne; per un test del webhook puoi usare un tunnel temporaneo (`brew install cloudflared` poi `cloudflared tunnel --url http://localhost:3000`) e il pulsante *Test* della console Meta.

---

## 4. Cosa devi fare tu su Meta (solo tu: richiede i tuoi accessi)

> Non incollare mai password o token in chat (nemmeno a Claude). I valori vanno solo nel file `.env`.

**Correzione importante:** OpenReply usa *Instagram Login*, quindi **non serve collegare l'account Instagram a una Pagina Facebook**. Serve solo un account Instagram **Professionale** (Business o Creator).

1. **Crea l'app** su developers.facebook.com/apps → tipo *Business* → caso d'uso *"Gestisci messaggi e contenuti su Instagram"*. Non scegliere Facebook Login né Marketing API. Consiglio un'app nuova dedicata, separata da quella dell'Alpha DM Reader.
2. **Copia 3 valori nel `.env`:**
   - `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` → prodotto Instagram → *Configurazione API con accesso Instagram* (l'ID Instagram è diverso dall'ID app Facebook).
   - `FACEBOOK_APP_SECRET` → Impostazioni app → Di base → Chiave segreta.
3. **Aggiungi il tuo account come tester:** Ruoli app → *Tester Instagram* → username esatto. Poi **sull'app Instagram**: Impostazioni → App e siti web → Inviti tester → Accetta. (Senza questo: errore "Insufficient Developer Role".)
4. **Redirect OAuth:** in *Impostazioni accesso aziendale* aggiungi `https://TUO-DOMINIO/api/instagram/callback` (senza `/` finale).
5. **Webhook:** URL `https://TUO-DOMINIO/api/webhook`, token di verifica = `WEBHOOK_VERIFY_TOKEN` del tuo `.env`. Iscriviti ai campi **`comments`** e **`messages`** (il secondo serve per le risposte alle Storie e ai DM).
6. **Pubblica l'app (Live):** prima inserisci gli URL `https://TUO-DOMINIO/privacy`, `/terms`, `/data-deletion` (le pagine esistono già). In modalità sviluppo Meta non invia i webhook dei commenti veri.
7. **Permessi:** `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages` (+ `instagram_business_manage_insights` per le statistiche).
   **App Review e verifica aziendale NON servono** se colleghi solo account tuoi aggiunti come tester ("Standard Access"). Servono solo se vuoi offrire il servizio ad account di altri (clienti): in quel caso usa `META_APP_REVIEW.md`.
8. **Uscita da ManyChat (fondamentale):** in ManyChat → Settings → Instagram → *Disconnect channel*. Poi Meta Business Suite → Impostazioni → Integrazioni → *Instradamento conversazioni* → Partner apps: rimuovi ManyChat e, su OpenReply, attiva *Accedi a tutte le conversazioni* e *Prendi il controllo delle conversazioni*. Altrimenti i tap sui pulsanti nei DM falliscono ("not the thread owner"). Non tenere attivi i due sistemi insieme.
9. **Collega e prova:** nel pannello → Settings → Connect Instagram → crea una campagna → commenta la parola chiave da un *altro* account.

---

## 5. Produzione

### 5a. Quella attiva: Railway (scelta il 25/10/2026)

- Progetto Railway **openreply** (workspace Percorso Alpha), piano Hobby 5 $/mese con 5 $ di consumo inclusi; spesa prevista 5–10 $/mese. Imposta un tetto in Railway → Usage.
- Codice: repo privato **github.com/danymonta/openreply**, branch `main`. Ogni `git push` su `main` ridistribuisce da solo web, worker e cron.
- Servizi (tutti dallo stesso Dockerfile, il ruolo lo sceglie `OPENREPLY_ROLE`):

| Servizio | Ruolo | Note |
| --- | --- | --- |
| `web` | pannello + webhook | URL pubblico: **https://web-production-be8a6.up.railway.app**; applica le migrazioni all'avvio |
| `worker` | invia i DM | sempre acceso, nessun URL pubblico |
| `cron` | rinnovo token, aggancio reel, follower | chiama `/api/cron/*` con `CRON_SECRET` |
| `Postgres`, `Redis` | database e coda | solo rete privata Railway |

- Segreti di produzione (`NEXTAUTH_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`, `WEBHOOK_VERIFY_TOKEN`) generati a caso e diversi da quelli locali; li vedi in Railway → servizio → Variables. **Copia `ENCRYPTION_KEY` nel tuo password manager.**
- Variabili che inserisci **tu** in Railway (Variables, su `web`, `worker` e `cron`):
  - `RESEND_API_KEY` (da resend.com, piano gratuito). Con il mittente `onboarding@resend.dev` Resend consegna solo all'email con cui ti sei registrato a Resend: va bene, l'accesso è comunque solo tuo.
  - `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `FACEBOOK_APP_SECRET` (dall'app Meta, §4).
- Nei passaggi Meta del §4 usa come dominio `web-production-be8a6.up.railway.app`: redirect `https://web-production-be8a6.up.railway.app/api/instagram/callback`, webhook `https://web-production-be8a6.up.railway.app/api/webhook`, token di verifica = `WEBHOOK_VERIFY_TOKEN` del servizio `web`.
- Stato: `https://web-production-be8a6.up.railway.app/api/health`. Log: `railway logs --service worker` dalla cartella del progetto.
- Backup: Railway → Postgres → Backups (attiva i backup programmati).

### 5b. Alternativa più economica: un VPS con Docker

**Opzione:** Hetzner Cloud (data center in Germania/Finlandia, GDPR) CX23 o CAX11, Ubuntu 24.04, con questo stesso `compose.selfhost.yml` + Caddy.

```bash
# sul VPS, come utente non-root con Docker installato
git clone <il-tuo-fork-privato> openreply && cd openreply
# crea .env (vedi .env.example) con: NEXTAUTH_URL=https://reply.tuodominio.it,
# OPENREPLY_DOMAIN=reply.tuodominio.it, RESEND_API_KEY, EMAIL_FROM, niente EMAIL_SERVER
docker compose -f compose.selfhost.yml --profile prod up -d --build
```

Il DNS: record `A` di `reply.tuodominio.it` → IP del VPS (su Cloudflare lascia la nuvola **grigia** all'inizio, così Caddy ottiene il certificato senza complicazioni).

### Costi mensili stimati

| Voce | Opzione consigliata | Costo |
| --- | --- | --- |
| Server | Hetzner CX23 / CAX11 (2 vCPU, 4 GB) | ~4–6 €/mese |
| Snapshot/backup server | Backup automatici Hetzner (+20%) | ~1 €/mese |
| Backup database fuori server | Hetzner Storage Box BX11 o Backblaze B2 | 0,10–4 €/mese |
| Dominio | Sottodominio del tuo dominio esistente | 0 € (o ~10–15 €/anno) |
| DNS / HTTPS | Cloudflare (gratis) + Caddy/Let's Encrypt | 0 € |
| Email di login | Resend piano gratuito (3.000 email/mese) | 0 € |
| Meta API | Gratuita | 0 € |
| **Totale** | | **~6–11 €/mese** |

Altre alternative: **Render** (web + worker + Postgres + Redis ≈ 30 $/mese), oppure lo stack gratuito descritto in `docs/stack.md` (Vercel + Neon + Redis Cloud + VM Oracle gratuita): 0 € ma cinque servizi da tenere d'occhio. Il VPS costa meno di Railway ma richiede di gestire il server.

Tempo di manutenzione: ~1 ora al mese (§8).

---

## 6. Checklist di sicurezza

**Server**
- [ ] Accesso SSH solo con chiave: `PasswordAuthentication no`, `PermitRootLogin no`.
- [ ] Firewall (Hetzner Cloud Firewall o `ufw`): aperte solo 22, 80, 443. Docker scavalca `ufw` per le porte pubblicate: per questo Postgres/Redis non sono pubblicati e il web è solo su `127.0.0.1`.
- [ ] Aggiornamenti automatici: `sudo apt install unattended-upgrades && sudo dpkg-reconfigure unattended-upgrades`.
- [ ] Opzionale: `fail2ban` per SSH.

**Applicazione**
- [ ] Solo HTTPS (Caddy + HSTS già configurati).
- [ ] Firma webhook: già attiva; imposta **entrambi** `INSTAGRAM_APP_SECRET` e `FACEBOOK_APP_SECRET`.
- [ ] `ALLOWED_EMAILS` con solo le tue email (e del team).
- [ ] `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `CRON_SECRET` generati a caso (`openssl rand -hex 32`), mai i valori d'esempio. Salva `ENCRYPTION_KEY` anche in un password manager: se la perdi, devi ricollegare Instagram.
- [ ] `.env` con permessi 600, mai su git, mai in chat. Se un segreto finisce in un log o in una chat, ruotalo.
- [ ] Repository del tuo fork **privato**.

**Dati e backup**
- [ ] Backup notturno del database fuori dal server, es. cron:
  `docker compose -f compose.selfhost.yml exec -T postgres pg_dump -U openreply openreply | gzip > backup-$(date +%F).sql.gz` e poi copia sulla Storage Box.
- [ ] Prova un ripristino almeno una volta.
- [ ] Controlla `https://TUO-DOMINIO/api/health` (puoi usare un monitor gratuito come UptimeRobot).

---

## 7. Restare dentro le regole Meta (rischio ban minimo)

Con l'API ufficiale il rischio di ban dell'account è molto basso: è lo stesso canale che usa ManyChat. Nessuno può garantire il 100%, ma quello che conta è il comportamento:

- **Una sola risposta privata per commento**, entro 7 giorni dal commento (regola Meta, già gestita).
- **Finestra di 24 ore:** dopo la prima risposta puoi scrivere ancora solo se la persona interagisce (risponde o tocca un pulsante), entro 24 ore. Niente DM a freddo né invii di massa: l'API non lo permette e non va forzato.
- **Velocità:** Meta documenta un tetto di 750 risposte private/ora per account; qui è limitato a **300/ora** (`DM_RATE_LIMIT_PER_HOUR`). Nei picchi (reel virale) l'eccesso va in coda e viene smaltito nelle ore successive, fino a 24 ore (`DM_MAX_REQUEUE_ATTEMPTS=48`): la risposta privata resta valida 7 giorni dal commento.
- **Varia i testi:** usa più varianti della risposta pubblica (OpenReply ne sceglie una a caso) e `{username}` nel DM. Evita lo stesso link identico in centinaia di risposte pubbliche.
- **Parole chiave sensate** (es. `PERCORSO`, `INFO`), non trigger su ogni commento.
- **Follow gate con moderazione:** è consentito, ma non abusarne.
- Contenuti dei DM conformi alle policy (niente promesse ingannevoli, link affidabili).
- Un solo strumento alla volta collegato alle conversazioni (vedi uscita da ManyChat).

Nota: il ritardo casuale prima di rispondere ai commenti non c'è ancora (issue #63 del progetto). Non è necessario per l'API ufficiale; se lo vuoi, si può aggiungere come modifica nostra.

---

## 8. Manutenzione (≈ 1 ora al mese)

```bash
# Aggiornare dal progetto originale
git remote add upstream https://github.com/diwenne/openreply.git   # una volta sola
git fetch upstream && git merge upstream/main
npm audit --package-lock-only --omit=dev       # controlla vulnerabilità
docker compose -f compose.selfhost.yml --profile prod up -d --build
```

- Il token Instagram dura 60 giorni e si rinnova da solo (servizio `cron`); se `/api/health` o i log del cron mostrano errori, ricollega l'account.
- Segui le issue/PR di sicurezza su github.com/diwenne/openreply; se il manutentore non le unisce, applicale tu (come fatto qui).
- Aggiorna le immagini Docker (`docker compose pull`) e il sistema del VPS (automatico).

## 9. Avvisi, backup, link e contatti

- **Avvisi via mail** (ogni 15 minuti, a `ALERT_EMAIL` o al primo indirizzo di `ALLOWED_EMAILS`): worker fermo, token Instagram non rinnovato o in scadenza entro 3 giorni, Instagram che rifiuta l'accesso, 5+ DM o eventi falliti in un'ora. Una mail per problema (promemoria ogni 12 ore) e una "Tutto di nuovo a posto" quando si risolve. Gli errori "invalid for a private reply" sono ignorati: sono commenti a cui aveva già risposto ManyChat.
- **Backup** ogni notte alle 03:00 UTC: arriva per mail il file `openreply-AAAA-MM-GG.dump`. Per ripristinarlo su un database vuoto:
  ```bash
  pg_restore --no-owner --clean -d "<DATABASE_URL>" openreply-AAAA-MM-GG.dump
  ```
- **Link nei DM** su `https://link.percorsoalpha.com/r/…` (CNAME `link` → Railway su Netsons, variabile `LINK_BASE_URL` su web e worker). Qualsiasi altro indirizzo su quel dominio porta al profilo Instagram (`LINK_HOME_URL`).
- **Contatti**: pulsante "Export CSV" nella pagina Contacts. Per mandare ogni nuovo contatto a un CRM imposta sul servizio web `CONTACT_WEBHOOK_URL` e `CONTACT_WEBHOOK_SECRET`: ogni 5 minuti arriva un POST firmato (`X-OpenReply-Signature: sha256=…`).
- **Conversation Starter** ("Voglio sapere come funziona il tuo Percorso") è su OpenReply: il tocco equivale a scrivere "Coaching" e risponde la campagna INFO COACHING. Si cambia con `PUT /api/instagram/ice-breakers` (massimo 4 domande); su ManyChat è disattivato.
