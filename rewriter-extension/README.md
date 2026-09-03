# Rewriter

A Chrome side-panel extension that rewrites whatever text you have selected, on any page.

Select text → open the panel → pick one action → **Copy** or **Replace on page**.

It is deliberately not tied to any particular app. It reads the browser's own selection instead of
hunting for a specific site's editor, so it behaves identically in Outlook, Gmail, WordPress, Elementor,
Teams, a CMS field, a support ticket or a plain form.

---

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `rewriter-extension` folder
4. Pin the icon to the toolbar
5. Click the icon → the side panel opens → paste your Anthropic API key in **Settings** and **Save key**

The key is stored in `chrome.storage.local` — this browser profile only. It is sent to
`api.anthropic.com` and nowhere else.

---

## Two modes

**Rewrite it** — the selected text *is* the thing being changed. Output replaces it.

**Reply to it** — the selected text is a message you're answering. Output is a new reply, which goes
wherever your cursor is rather than over the original.

Switch with the toggle at the top. The panel relabels itself so it's always clear which one you're in.

---

## You don't have to select anything

**Read the page** takes the most specific thing it can find, in this order:

1. **Your selection**, if you made one.
2. **The field you're typing in**, if it's focused — the whole thing.
3. **The page**: the compose box you're writing in, and in Reply mode the message on screen.

So the normal case is: open a reply, click **Read the page**, and it has what it needs. Select text only
when you want a *specific part* rather than the obvious one.

Step 3 is the only part that knows anything about mail clients — it looks for a compose box and for
rendered message bodies. It's reached only when there's no selection, so it can never make the selection
path worse, and everything degrades to "nothing found" rather than grabbing the wrong thing.

The status line always says which of the three happened.

---

## Using it — Rewrite

1. Optionally select the text. Skip it and the compose box you're typing in is used.
2. Click the Rewriter icon.
3. **Read the page** — the text appears in the panel, with a note saying where it came from.
4. Pick an **Action**. Add an **Extra instruction** if this one needs something specific.
5. **Rewrite.** Output streams in; **Stop** cancels.
6. **Changes** shows a word-level diff against the original. **Copy**, or **Replace on page**.

## Using it — Reply

1. Open the message and hit **Read the page**. No selecting needed — it finds the message on screen, or
   falls back to the quoted block inside a full-window reply. Anything you'd already typed in the compose
   box is carried over into **What you want to say**, so a rough note becomes the brief.
2. **A draft appears straight away**, without you asking. Use it, regenerate it, or ignore it.
3. To steer it: type into **What you want to say** (bullets are fine), pick a different action, and
   **Draft reply**.
4. Click into the compose box, then **Insert at cursor**. Or just **Copy**.

The proactive draft is what Gmail's suggested replies do, and the point is the same: most of the time the
obvious reply is the right one, and reading a draft is faster than starting from a blank box.

**It costs one API call every time you pull text in while in Reply mode**, including the times you didn't
want a draft. Turn it off in Settings → *Reply mode* if that annoys you; the **Draft reply** button still
works on demand.

**No sign-off, ever.** Replies end on the last real sentence — no "Thanks, Poll", no signature block —
because your compose window already appends one and two would look careless. This is a hard rule in the
prompt, not a style preference.

There is no **Changes** diff in Reply mode: a reply is new text, so there's nothing to diff it against.

### Actions — Rewrite mode

One dimension each. There is no "make it better" button, on purpose — a rewrite you cannot predict is a
rewrite you have to re-read from scratch.

| Action | What it does |
|---|---|
| Grammar only | Spelling, grammar, punctuation, clearly awkward phrasing. No restyling, nothing added or removed. |
| Shorten | Cuts hard, keeps every point that carries meaning. |
| Expand | Adds detail a reader needs to act. Invents nothing. |
| Formalize | Raises the register. Full sentences, no contractions. |
| Casual | Lowers it. How you'd say it to a colleague. |
| Clearer | Restructures. Front-loads the point, splits run-ons, one idea per sentence. |
| Friendlier | Warmer, same length. Does not become gushing. |
| Plain English | Strips jargon and acronyms so an outsider gets it first time. |
| To bullets | Tight list, one idea per bullet, no sub-bullets. |
| To prose | List back into readable paragraphs, every item kept. |

### Actions — Reply mode

Straight reply · Very short · Acknowledge · **It's done** · Warmer · More formal · **Say no** ·
**Ask back** · Follow up.

*It's done* and *Ask back* are the two that earn their place on a web support desk: reporting completed
work in the requester's own terms, and asking for the one missing detail before anything can proceed.
*Say no* declines without leaving false hope.

### Signatures are trimmed on the way in

Select the body of a compose box and your own signature comes with it. Left alone, the model faithfully
reproduces it and you have to hand-delete it from the result — which defeats the point, since the compose
window appends the real one anyway.

So `text-utils.js` cuts it **on capture**, before it costs tokens or reaches the prompt. The status line
says *"signature trimmed"* when it fires, and the trimmed text is sitting in the box for you to check.
It catches a `Best,`-style closing with a name block under it, anything after a `--` separator, and a
bare contact block with no closing word at all.

It is deliberately conservative, and refuses any cut that would eat most of the text or leave almost
nothing — **missing a signature is much cheaper than swallowing a draft**. Selecting *only* a signature
therefore leaves it intact. The prompts also forbid emitting one, but that is the backstop; this is the fix.

### Changing the result

Three ways, in increasing order of effort:

- **Edit it.** The result box is a normal text field — type in it. What you edit is what gets copied,
  replaced or inserted, and the character count and diff follow your edits.
- **Run it again.** Once there's a result the button reads **Rewrite again** / **Draft another**. Same
  input, fresh output. Change the action or add an extra instruction first to steer it somewhere else.
- **Use as input.** Moves the result up into the text box so you can run a *second* action on it —
  Shorten, then Friendlier. The page target is unchanged, so **Replace on page** still works after
  chaining.

Only running it again costs an API call. Editing and chaining are free.

### House style

Set it once in Settings and it applies to every rewrite, in every action. This is what makes it a team
tool rather than a personal one — everyone's output lands in the same voice. Write rules, not examples.

---

## Replace on page

**Copy always works. Replace is best-effort, and the panel tells you which you are getting** — the dot
under the text box is green when the selection can be written back, amber when it can't.

| Where the text came from | Replace | Notes |
|---|---|---|
| `<textarea>` / `<input>` | Yes | Uses `setRangeText`, so Ctrl+Z still undoes it. Fires `input` and `change` so the host app notices. |
| `contenteditable` (rich editors) | Yes | Uses `execCommand('insertText')` — deprecated, but the only method that keeps native undo *and* fires the events rich editors listen for. Falls back to range surgery, which loses both; the panel says so when that happens. |
| A whole compose box read with nothing selected | Yes | Explicit DOM surgery, **no undo**. `execCommand` across a range ending right before the quoted thread makes Chrome merge the two and destroy the `.gmail_quote` / `#divRplyFwdMsg` element. Corrupting a reply is worse than losing Ctrl+Z, so this path is deterministic and reports `undoable: false`. |
| Read-only page text | No | Rewrite it and copy. Replace refuses rather than mangling the page. |

Two things that switch Replace off, both on purpose:

- **Editing the text in the panel.** Once you type over the pulled-in text, it no longer matches what is
  on the page, so writing it back could overwrite the wrong thing.
- **The field disappearing.** If the page re-rendered between capture and replace, it reports that
  instead of writing into a detached node.

After a successful replace into a form field, the new text is left selected, so you can chain a second
rewrite straight off the first.

---

## How it is put together

| File | What it is |
|---|---|
| `manifest.json` | MV3. `scripting` + `storage` + `tabs` + `sidePanel`, and host access to all http/https pages. |
| `background.js` | Four lines: open the side panel on toolbar click. |
| `panel.html/.css/.js` | The whole UI, the Anthropic call, and the diff. |
| `selection.js` | The three functions injected into the page: `captureSelection`, `replaceSelection`, and `insertAtCursor`. |
| `text-utils.js` | `stripSignature`. Runs in the panel, not the page — it is a pure function so it can be tested directly. |

`replaceSelection` writes over what `captureSelection` recorded. `insertAtCursor` deliberately ignores
that and uses wherever the caret is *now* — Reply mode captures from a message that is usually read-only
and then writes somewhere else entirely, so the two cannot share a target.

**Why `selection.js` reads so repetitively:** `chrome.scripting.executeScript` serialises each function to
source and runs it in the page, so neither may reference anything from the surrounding file — every helper
has to be declared inside the function body. `captureSelection` also stashes *where* the text came from on
`window.__rrmRw`, because the two injections are separate calls and nothing else survives between them.

There is no declared content script. Everything is injected on demand, which means the extension works on
tabs that were already open when you installed it — no "reload the page first".

Model: `claude-opus-5` at `effort: "low"`, streamed. Low effort is right for work this short and keeps it
fast and cheap; the system prompt does the heavy lifting.

---

## Tests

Both run in a normal browser — **serve the repo over http**, `file://` will not work.

```bash
python -m http.server 8781 --directory .
```

- **`test/selection-fixture.html`** — runs the real `selection.js` against a textarea, an input, a
  contenteditable and read-only text. Covers partial selections, whole-field fallback, that surrounding
  text is untouched, that `input` events fire, that read-only text is refused, and that a field removed
  from the DOM is reported rather than thrown on, the no-selection fallbacks against both mail layouts
  (inline reply with a reading pane, and a full-window reply where the thread is only the quoted block),
  that replacing a compose box leaves the quoted thread intact, and the Reply-mode flow where text is
  captured from a read-only message and inserted somewhere else. 36 checks; runs on load.
- **`test/signature-fixture.html`** — 15 checks on `stripSignature`, split between signatures it must
  remove and content it must leave alone (an email address in the body, a contact list that *is* the
  content, a mid-sentence "thanks"). The second half is the one that matters. Runs on load.
- **`test/panel-preview.html`** — loads the real `panel.html` with `chrome.*` stubbed, so the panel can be
  worked on in an ordinary tab. **Use selected text** and **Replace on page** act on a stand-in textarea,
  exactly as they would on a real page. Everything except the Anthropic call is real: put a key in and
  **Rewrite** will hit the live API and bill your account.

Run the selection fixture after touching `selection.js`.

---

## What costs money

Every **Rewrite** / **Draft reply** is one API call on your own key — roughly 1–3 cents on
`claude-opus-5` (a ~400-token system prompt plus your text in; a few hundred tokens out, including
thinking tokens, which bill as output). **Test** in settings is a fraction of a cent.

Free, because they run locally: reading the page, signature trimming, editing the result, the diff,
chaining with **Use as input**, Copy, Replace and Insert.

The one that spends without you asking is Reply mode's automatic draft — one call every time you hit
**Read the page** while in that mode. Settings → *Reply mode* turns it off.

If the bill matters more than the last few percent of quality, switching `MODEL` in `panel.js` to
`claude-haiku-4-5` costs roughly a fifth as much.

---

## Limits

- Text you rewrite is sent to Anthropic's API. Use a dedicated key with a spend limit, keep NDA material
  out, and remember this is the only tool in the repo that does this.
- Multi-line text pasted into a rich editor may land with different paragraph breaks than you selected —
  editors normalise newlines their own way.
- No rewrite history. **Rewrite again** overwrites the previous result — copy anything you want to keep,
  or edit in place instead of regenerating.
- Chrome-family browsers only (side panel API). Not Firefox or Safari.
