# Task board — notes for Claude Code sessions

Static site on GitHub Pages (`gse281/task-board`). No build step. Data lives in Airtable base `appdDTNBbVrp6hVOv` ("Project & Task Manager").

## 1. Log what you leave open (feeds the AIOS map)

The AIOS map (`aios.html` › Open items › Claude Code) shows every Claude Code session's open items, from every device.
It reads Airtable table **AppNotes** (`tblfAeWMfvocVGxZk`), one row per device, Key = `aios:code:<device>`:

- `<device>` = the computer's name, lower case, no spaces (`rmb-home-pro`, `rmbimac24`). Cloud sessions use `web`.
- Text, line 1: `@<ISO time>`. Then one numbered line per open item, newest first:
  `1. Short title: what is open and what happens next <https://link-to-the-session-or-file>`
  Start the text with `!` when it is waiting on Roni: `2. ! Deploy: waiting for your OK to push`.
- Updated = the same time, plain text.

Rules:

1. Before you end a turn with anything unfinished, unanswered or waiting on Roni, upsert your device's row: read it, change only your own lines, write it back.
2. When an item closes, delete its line. No open items = line 1 only.
3. Never touch another device's row, or the `aios:duet` / `aios:instinct` rows.
4. A real task for Roni (not session state) goes in **Items** instead: Task, Status `Open`, Source `Code`, TextExclude checked.

## 2. Pages

| Page | File | Notes |
|---|---|---|
| Focus (site root) | `index.html` = `radial.html` | keep the two files identical |
| Dashboard | `dashboard.html` = `grid.html` | keep the two files identical |
| Focus 2 | `focus2.html` | also runs off-site, so it loads `nav.js` by absolute URL there |
| Email | `email.html` + `gmail-live.js` (Live) + `emailrun.js` (Scan) | extra run rules: `EMAIL_RULES.md` |
| Run | `run.html` | one task at a time, keyboard-first; same field rules as the iPhone cards. `run.html?list=1` runs the list a Focus pop-up handed over (▸ Run → `localStorage['tb.run.list']` = `{title, ids, at, back}`) |
| Meetings | `meet/` | meetings-only page, also its own iPhone Home Screen app |
| AIOS map | `aios.html` + `aios-data.js` | snapshot in `aios-data.js`; to-dos, feeds and health load live |
| iPhone Tasks | `m/` | own service worker |

- The top-right page links are `nav.js` on every page. Add or reorder a page there, nowhere else.
- Bump the `?v=` on a script tag when you change that script.
- Add one line to `changelog.md` per change: `- YYYY-MM-DD HH:MM  what changed`.
- Task editor (`task-editor.js`, every page): keep it calm. Top = Task, Next step, Project/Lead/Sub, Category, Notes. Anything else goes in the folded **More** or **Claude** section, not on top. Footer stays one row.
- Focus list pop-ups (`openList`, `openFiltered`): every one gets the add box (`ovAddHTML` / `ovAddWire`) and ▸ Run (`RUNBTN` / `ovRunWire`).

## 3. Task categories

A task's category is its `Section` text in Items (plus `MeetingSlot` for the two calls). `@Computer – Claude` = needs Roni at the Mac.
`Drive to done` = handed to Claude to own until closed (the drive-to-done skill sets it on its tracking record). It is in the task editor's
category list, a pane on Focus, list 5 on Run, and a group in the AIOS map. New fixed categories go in `task-editor.js` (`CATS`) and Focus (`CAT`).

**Hibernate** = `Status` `Hibernating`: kept, but out of circulation. Only the Status changes, so the task keeps its category and wakes back into it.
Every page loads `Open` tasks only, so a hibernating task disappears everywhere by itself; a new page or job must not load `Hibernating`.
One task: editor › Snooze › ❄ Hibernate, or `H` on Run. A whole category: ❄ Hibernate all in its Focus list. Wake: Focus footer › ❄ HIBERNATING (Focus loads them alongside the open ones; `isHib`, `hibSet`, `openHib`).

## 4. Email page

- Categories: `H` Last hour, `D` Starred, `Z` Snoozed, `C` Reply, `B` Don't miss, `I` Invitations, `N` Not sorted yet, `E` Everything else, `A` Archive, `K` Kept, `X` Hidden 24h. Defined once, in `gmail-live.js` (`BUCKETS`).
- Scan takes its thread list and categories from Live (`GL.snapshot()`), so the two tabs always show the same counts. Don't give Scan its own classification.
- Calendar mail: invitations (new, updated, cancelled) go to `I`; accept / decline replies go to `A`, only when a calendar sent them (`calKind`, in the Live script).
- Draft reply button: writes an EmailNotes Note "Draft a reply[: what to say]". The Email run drafts it (`EMAIL_RULES.md` rule 20); the page never drafts or sends by itself.
- Kept and Hidden are stored in AppNotes, Keys `email:kept` and `email:hide` (JSON). Hidden lasts 24 h, or until a new message arrives in the thread.
- Never send, trash or unsubscribe from the page. Archive only on Roni's press.
