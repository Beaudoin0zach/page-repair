# Page Repair — tester guide

Thank you for testing! Page Repair is a Chrome extension that fixes broken
pages for screen reader users: heading structure, missing landmarks, and
unnamed buttons/links. It only ever runs when you ask it to.

Setup is about five minutes and fully keyboard-accessible.

## Install (Chrome, Edge, or Brave on Windows or Mac)

1. Unzip the `page-repair.zip` file you received.
2. Open your browser and go to `chrome://extensions`
   (in Edge: `edge://extensions`).
3. Turn on "Developer mode". In Chrome it is a toggle button near the top
   right of the extensions page.
4. Activate the "Load unpacked" button and choose the unzipped
   `page-repair` folder.
5. You should hear/see "Page Repair (prototype)" listed.

## Enter your credit token

1. On the extensions page, find Page Repair and open "Details", then
   "Extension options" (or right-click/context-menu the toolbar icon and
   choose Options).
2. Skip to the "Option A: prepaid credits" section (heading level 2).
3. Paste the token that came with this guide into "Credit token".
4. Activate "Test token" — you should hear "Token works. 100 credits
   remaining."
5. Activate Save. You should hear "Saved."

Your token has 100 credits. One credit repairs one page. Heading and
landmark fixes are free and unlimited — credits are only spent when the
extension labels unnamed controls.

## Use it

On any page that feels broken — messy headings, buttons that just say
"button" — press **Alt+Shift+R** (Windows) / **Option+Shift+R** (Mac).

You will hear a polite announcement like:
"Page repair: fixed 3 heading levels. Labeling 12 unnamed controls…"
and a few seconds later:
"Page repair complete: labeled 12 of 12 controls."

The page itself is never reloaded, focus never moves, and nothing changes
visually. Labels the AI was unsure about carry an "auto-labeled,
unverified" note spoken *after* the label (as a description, so it stays
out of braille and doesn't break voice control) — you always know what is
machine-guessed, and the completion announcement tells you how many were.

Two more shortcuts:

- **Alt+Shift+U** (Option+Shift+U on Mac) undoes every repair and restores
  the page exactly as it was — try it if a fix ever feels wrong.
- A third command copies an accessibility report about the page to your
  clipboard (findings with WCAG references), for you to paste into an email
  or the site's feedback form if you want to tell them. It has no default
  key — assign one at `chrome://extensions/shortcuts` if you want it.

A good first test: news.ycombinator.com — the voting arrows are unnamed
links on the real site; after repair they should read "Upvote story".

## What we want to know

After trying it on a few sites you actually use:

1. Did any announcement lie to you — a wrong label, a heading that made
   the outline worse?
2. Did it ever speak when you didn't ask, steal focus, or break the page?
   (That's a bug we want to hear about immediately.)
3. Which real site do you most wish this worked better on?
4. Was anything about setup or the options page inaccessible with your
   screen reader?
5. Would you pay a few dollars for a bundle of credits? What feels fair?

Send answers, complaints, and anything confusing — blunt is better.
