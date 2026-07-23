# Page Repair — style remediation plan

Source: `bas-platform/docs/style-eval-2026-07-19.md` (Voice 3.9/5, Quality 4.6/5, 2,123 words).

Highest voice score in the portfolio. The prose here is the benchmark, so this
plan is surgical. Three items are real defects; three are judgment calls; one is
explicitly a do-not-touch list.

All targets verified against the working tree on 2026-07-19.

---

## P0 — Ship blocker

### 1. `STORE_LISTING.md:94-98` — unresolved privacy policy URL

**Verified.** Line 95 reads `Host PRIVACY.md at a public URL and paste it here.`
followed by two bullets of options. The Chrome Web Store requires a real URL in
this field; the listing cannot be submitted as written.

**Facts established:**
- `PRIVACY.md` exists at repo root (4,533 bytes, last updated 2026-07-13).
- `Beaudoin0zach/page-repair` is **public** (`visibility: PUBLIC`), and the file
  is present on remote `main` — verified via the contents API.
- GitHub Pages is **not** enabled on the repo (404 from the pages API).
- The marketing site `beau-access-solutions` already ships
  `src/pages/apps/page-repair.astro` (203 lines) with a "What gets sent, and
  when" section at line 164 — a privacy summary, not the policy itself. Site is
  `https://beauaccesssolutions.com`, static Astro on Netlify.

**Recommendation: host it on the marketing site, at
`https://beauaccesssolutions.com/apps/page-repair/privacy`.**

Rationale over the GitHub blob URL: the blob URL works today and would pass
review, but it hard-codes a repo path into a store field that is painful to
change later, renders GitHub chrome around a legal document, and reads as
provisional on a listing whose whole argument is that this project is not
provisional. The marketing site already owns the app's public identity and
already has a privacy-shaped section on the same page.

**Work:**
- New file `beau-access-solutions/src/pages/apps/page-repair/privacy.astro`,
  using `BaseLayout.astro`, porting `PRIVACY.md` verbatim in content.
- Add a "Full privacy policy" link from the existing privacy section at
  `src/pages/apps/page-repair.astro:164`.
- Decide the source of truth: I recommend the Astro page becomes canonical and
  `page-repair/PRIVACY.md` gains a one-line pointer to the live URL, rather than
  maintaining two copies that will drift.

**Then replace `STORE_LISTING.md:94-98` with:**

```markdown
## Privacy policy URL
https://beauaccesssolutions.com/apps/page-repair/privacy
```

**Effort:** ~45 min (30 min port + layout, 10 min link + listing edit, 5 min
deploy verify). Cross-repo — touches `beau-access-solutions`.

**Fallback if you want to ship today:** paste
`https://github.com/Beaudoin0zach/page-repair/blob/main/PRIVACY.md` (verified
live and public) and treat the marketing-site page as fast-follow. 2 min.

---

## P1 — Style defects with a clear fix

### 2. `STORE_LISTING.md:58-60` — the detailed description dies on billing admin

**Verified.** After seven bullets of genuine argument, the section closes:

> Labeling requires either your own Anthropic API key or a prepaid credit
> token — you choose in the options page. See the privacy policy for exactly what
> data is sent and when.

The last thing a reader carries out of the description is a billing footnote.
The strongest material in the whole listing — the overlay inversion — is buried
as a section header at line 35.

**Proposed change:** move the billing paragraph up to sit directly after the
three capability bullets (i.e. after line 33, before "What makes it different
from an accessibility 'overlay'"), and close on the inversion instead.

New closing paragraph after the seventh bullet:

```markdown
Overlays are installed by the site, run on every visitor automatically, and
declare the page compliant. This is the inversion: you install it, you invoke
it, it fixes only what it can verify, and it tells you what it did.
```

Note this echoes `README.md:8-10` deliberately — the two documents should make
the same argument in the same voice, and the README's version is the portfolio's
strongest paragraph.

**Effort:** 15 min.

### 3. `STORE_LISTING.md:12` — the 132-char summary leads with mechanism

**Verified.** Current (123 chars):

> Fixes broken pages for screen reader users: labels unlabeled controls, repairs
> headings and landmarks. Always user-invoked.

The person appears as a prepositional object; the colon hands the rest of the
field to a feature list. Options, all within 132:

**A (recommended, 107 chars)** — leads with the reader, keeps the differentiator:
```
You press a key; unlabeled buttons get real names. Fixes headings and landmarks
too. Never runs on its own.
```

**B (109 chars)** — leads with the grievance:
```
The button your screen reader calls "button" gets a real name. Headings and
landmarks too. Only when you ask.
```

**C (117 chars)** — plainest:
```
Repairs the page you are on for screen reader users: real button names, working
headings, real landmarks. On request.
```

I'd ship A. B is the best sentence but risks reading as complaint rather than
capability in a 132-char slot with no room to recover.

**Caveat:** the summary is also the `manifest.json` description. Changing it
means editing `manifest.json` in the same commit, and the two must stay in sync.

**Effort:** 15 min including the manifest sync.

### 4. `README.md:1` — no concrete-sensory opening

**Verified.** Opens `# Page Repair (prototype)` straight into an abstract noun
phrase. The subject is a daily bodily experience and the document never lets the
reader feel it.

**Proposed:** keep the H1, insert one line above the existing summary paragraph.

```markdown
# Page Repair (prototype)

Your screen reader says "button." Then "button." Then "button." One of them
checks out your cart and you cannot tell which.

A user-invoked browser extension that repairs broken web pages for screen
reader users — fixing unlabeled controls, broken heading structure, and
missing landmarks with targeted ARIA patches that keep the page fully alive.
```

This is the single highest-leverage prose change in the plan. It also supplies
the concrete referent that the A7 finding (below) says is missing.

**Effort:** 20 min including a couple of drafts.

---

## P2 — Judgment calls, not mechanical targets

### 5. A7 diction (2.5/5) — zero signature constructions in the corpus

**Verified as reported.** A grep for `incredibly / the reality is / seek to /
sought to / create value / myriad / salient / holistic / comprehensive / robust`
returns nothing across the corpus.

**Read this finding carefully before acting on it.** Half those terms are ones
the guide flags as *tells to avoid* ("create value," "holistic," "robust,"
"comprehensive"). Their absence is a quality win, not a defect. Deliberately
inserting them would lower the score that matters.

The real signal underneath the 2.5 is the second sentence of the finding: **the
prose argues from citations rather than from a person.** Every claim in
`README.md:14-26` is sourced to a survey, a paper, or a position statement.
Nothing is sourced to having watched someone use the thing.

**Proposed fix — one paragraph, not a diction pass.** Add after the "Research
grounding" bullet list, before "Design rules":

```markdown
None of this is why the extension exists. It exists because vote arrows on
Hacker News are 31 unlabeled controls, finding every one takes under four
milliseconds, and the fix — a name, on each — is one nobody has shipped.
```

Both numbers are already in the repo's own measurements table
(`README.md`, "Measured": 31 controls, 3.9 ms in the *Audit* column), so
it's a claim the document can back. Note the four milliseconds is the audit
time — the cost of *finding* the controls, not of applying the names — so the
sentence must not present it as the repair time. It converts
the whole research section from citation-stacking to evidence in service of a
position someone holds.

Do **not** run a diction sweep. If item 4 and this paragraph land, A7 rises
because the prose gained a person, not because it gained vocabulary.

**Effort:** 20 min.

### 6. `README.md:14-26` — no hyperlinks-as-citation

**Verified.** Six checkable claims sit as bare text: 85.9%, n=15,
arXiv:2502.18701, "$0.50–$2.20 and 1–5 minutes per page", WebAIM #10, the
Overlay Fact Sheet, NFB position statements.

**Proposed link targets** (each needs a URL confirmed before landing):

| Line | Bare text | Link text should argue, not name |
| --- | --- | --- |
| 14 | WebAIM Screen Reader Surveys #7/#10 | `[what screen reader users actually asked for](webaim url)` |
| 15 | the Overlay Fact Sheet | `[why 800+ practitioners signed against overlays](overlayfactsheet.com)` |
| 15 | NFB position statements | `[the NFB's position](nfb url)` |
| 17 | arXiv:2502.18701 | `[From Cluttered to Clear](arxiv.org/abs/2502.18701)` |
| 20 | 85.9% | link the stat itself to the WebAIM #10 results table |
| 23-25 | 220K tokens / $0.50–$2.20 | link to the paper's methods section if it has an anchor |

The guide's point is that link *text* carries argument. `[the Overlay Fact
Sheet](...)` names a document; `[why 800+ practitioners signed against
overlays](...)` makes a claim the reader can go check. Prefer the latter
wherever the URL supports it.

**Constraint worth flagging:** don't link all six. Five inline links in a
13-line block reads as a citation dump and undoes the item-5 fix. I'd link
arXiv:2502.18701, the Overlay Fact Sheet, and the 85.9% — the three a skeptic
would actually go verify — and leave the rest as prose.

**Effort:** 40 min, most of it confirming stable URLs.

### 7. Em-dash density — 17.0/1k, highest in the portfolio

**Verified, with a measurement note.** Raw counts from the working tree:

| File | Words | Em-dashes | Density |
| --- | --- | --- | --- |
| `README.md` | 722 | 12 | 16.6/1k |
| `STORE_LISTING.md` | 757 | 16 | 21.1/1k |
| `PRIVACY.md` | 699 | 8 | 11.4/1k |
| `src/options.html` | 490 (incl. markup) | 8 | 16.3/1k raw |
| `CLAUDE.md` | 128 | 2 | 15.6/1k |

The report's 30.3/1k for `options.html` reconciles if you count visible prose
words only (~264) rather than raw tokens including markup — so the report is
right about the *user-facing* text and the raw number understates it.

**The guide names em-dashes as a genuine signature. This is not a target to
hit.** The question is only which ones stopped doing work. Reviewing all eight
in `src/options.html`:

- L6 `Page Repair — Options` (title), L31 `24px — SC 2.5.8 target floor`
  (comment), L8 `Theme tokens — default (light) values` (comment): **keep.**
  Three of the eight are not prose at all.
- L43 `are sent — never the`, L60 `No API account needed — labeling runs
  through`, L77 `our servers — you can audit`: **keep.** All three are the
  signature move — a claim, then the sharper restatement of it.
- L48 `static thereafter — no aria-live`: comment, **keep.**
- L55 `(copy that address into a new tab — extensions can't link to it)`:
  **candidate.** A parenthetical containing a dash is the one place the device
  is carrying nothing; a comma does the same job.

That's a net change of one, in a code comment's neighbor. **My recommendation:
change nothing here.** The density is high because the argumentative move that
earns this repo its 3.9 voice score *is* the em-dash restatement. Cutting them
to hit a number would flatten exactly what the eval says is working.

If you want a real reduction, `STORE_LISTING.md` at 21.1/1k is the file to look
at — and item 2 above already removes one by restructuring the close.

**Effort:** 0 (recommended). 30 min if you want a full pass on
`STORE_LISTING.md`.

---

## Do not touch

The eval calls these the strongest prose in the portfolio. Any edit in their
vicinity should leave them byte-identical:

- `README.md:8-10` — the "Not an overlay" inversion
- `README.md:55-57` — refusing automated complaints on justice grounds
- `README.md:91-93` — the "Nothing about us without us" closer

Item 2 deliberately borrows from the first of these. That's an echo, not a
rewrite of the original.

---

## Suggested order and total

| # | Item | Files | Effort |
| --- | --- | --- | --- |
| 1 | Privacy policy URL | `STORE_LISTING.md`, `beau-access-solutions` | 45 min |
| 4 | README sensory opening | `README.md:1` | 20 min |
| 2 | Store description close | `STORE_LISTING.md:58-60` | 15 min |
| 3 | Store summary | `STORE_LISTING.md:12`, `manifest.json` | 15 min |
| 5 | Person behind the citations | `README.md` (~L26) | 20 min |
| 6 | Hyperlinks-as-citation | `README.md:14-26` | 40 min |
| 7 | Em-dash density | — | 0 (recommended) |

**Total: ~2h35m**, of which 45 min is the ship blocker and spans two repos.

Items 4 and 5 are the pair that moves the voice score; they should land
together in one commit so the README's opening and its research section argue
from the same footing.
