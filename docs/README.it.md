# OpenCode UI — documentazione in italiano

**OpenCode UI** è un cockpit desktop (Electron) per gestire completamente il
**servizio OpenCode** — la stessa architettura client-server usata dalla
CLI e dalla TUI. L'app si aggancia al servizio condiviso tramite
`@opencode/client/service` (`Service.ensure()`): vede le stesse sessioni,
credenziali e configurazione del tuo `opencode` già installato.

> [▶ Guarda il demo di 80 secondi](https://github.com/marcot3ssar1/opencode-ui/raw/main/docs/media/demo_tiktok.mp4)

## Avvio rapido

Requisiti: **OpenCode V2** sul PATH (testato con `opencode 2.0.31` /
`@opencode/client 2.0.32`), **Node ≥ 22**.

```sh
git clone https://github.com/marcot3ssar1/opencode-ui.git
cd opencode-ui
npm install
npm run dev          # app con reload
npm run build        # build di verifica (out/)
npm run dist         # build + installer NSIS Windows (dist/)
```

## Viste (13)

| Vista | Cosa gestisce |
|---|---|
| Panoramica | stato servizio, info server/location, log eventi live |
| Sessioni | elenco per directory, creazione, fork, rinomina, eliminazione |
| Chat | messaggi in streaming, cambio agente/modello, interrupt, compact, comandi slash |
| Agenti | lista live dal server, editor dei file `.md` (globali e di progetto), `default_agent` |
| Permessi | richieste live con consenti-una-volta/sempre/nega |
| Modelli | provider e modelli con limiti e costi $/M |
| MCP & Integrazioni | server MCP (add/remove/connect/disconnect), risorse, integrazioni, credenziali |
| Configurazione | editor di `opencode.jsonc` globale, config di progetto e `cli.json` (TUI) |
| File | browser + editor del progetto via API filesystem di OpenCode |
| Terminale | comandi shell persistenti nel servizio, output in streaming |
| Git & Worktree | stato, branch, diff, worktree create/remove/refresh |
| Comandi & Skill | catalogo comandi/skill, esecuzione sulla sessione selezionata |
| Statistiche | uso modelli/tool, costi, activity, streak |

## Architettura

- `src/main` — processo principale: service discovery, client HTTP, bridge eventi
  SSE (`/api/event`, live-only → riconnessione + ri-snapshot), accesso sicuro ai
  file di configurazione globali.
- `src/preload` — bridge IPC tipizzato (`contextIsolation` ON, `nodeIntegration` OFF).
- `src/renderer` — React + TypeScript, i18n IT/EN inline, nessun backend esterno.

Le viste non parlano HTTP: tutto passa dal canale `bridge:request`; gli eventi
arrivano via `bridge:event`. Le chiamate location-scoped passano
`?location[directory]=…`.

## Blinky 👻

Blinky viene distribuito come normale file agente:
[`examples/blinky.agent.md`](../examples/blinky.agent.md) — copialo in
`~/.config/opencode/agents/blinky.md` e la vista Agenti lo mostrerà in rosso
(con `default_agent`), mentre i suoi permessi `ask` (`git push`, `npm publish`,
`git reset --hard`, lettura `.env`) compaiono live nella vista Permessi.

## Note

- L'editor dell'app scrive i file di configurazione come testo validato (JSON5):
  i commenti vengono preservati usando l'editor testuale.
- Il terminale usa `/api/shell` (comandi persistenti); la PTY interattiva
  (`/api/pty/*`) è mappata nell'API ma non esposta in v1.
- Alcuni percorsi API sono *experimental* a monte (sessioni, fs, config): la
  client è pinnata a 2.0.32 per coerenza con opencode 2.0.31.

## Licenza

MIT — vedi [LICENSE](../LICENSE).
