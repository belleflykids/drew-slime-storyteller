# Drew's Slime Storyteller

![Powered by Muse Ember](https://img.shields.io/badge/Powered%20by-Muse%20Ember-orange)

**Every story is written live by Muse Ember.**

A tiny storyteller for little hands. Drew — the cheerful little blue spider
from Bellefly Kids — tells a two-sentence story about the pretend slime a
child just made in Drew's Slime Bar Adventure. The storyteller is Ember:
she writes each story fresh, just for that slime.

**Play the game:** https://belleflykids.com/drews-slime-bar — the live Slime Bar. The Storyteller itself runs in the demo pages in this repo: open `demo/demo.html` (lightweight demo) or `demo/drews-slime-bar-with-story.html` (the full game with the story button) in a browser — no server needed. The story button is not on the live site yet.

This is Chalette Hodge's entry for the Muse Ember Hackathon (virtual, solo).
Project due December 2, 2026, 9:00 PM ET. Winners announced December 7, 2026.

## Meet Ember — the star of this project

Muse Ember is the AI behind every story. When a child finishes a slime and
taps "Hear Drew's story", Ember writes a fresh two-sentence story about that
exact slime — its colours, its topping, and its name — in Drew's warm, gentle
voice. No story is ever reused: every slime gets its own story, written live
by Ember.

## What it is

Drew's Slime Bar Adventure is a free pretend-play game for preschoolers:
pick slime colours, add a topping, and squish, poke, and stretch a glossy
pretend slime. Nothing in the game is a recipe for real slime, and there is
no score, no timer, and no failing.

**Drew's Slime Storyteller** is a new feature on top of that game. When a
child finishes a slime and gives it a name, Drew tells a tiny two-sentence
story about that exact slime — its colours, its topping, and its name.

## How it works

1. The child finishes a pretend slime in the Slime Bar: picks colours,
   picks a topping, and names the slime.
2. The child (or a grown-up helping) taps **"Hear Drew's story"**.
3. The game sends only the button picks to a small Cloudflare Worker:
   the slime colours, the topping, and the slime's name. Nothing typed
   is sent — a name typed in the box stays on the picture only — and no
   child's name, no photo, no personal detail, no account.
4. The Worker asks **Muse Ember** (`muse-ember-1.0`, via the Meta Model API)
   for a two-sentence story about that slime, in Drew's warm, gentle voice.
5. Drew's story appears on screen, ready to read aloud together. A **"Read it aloud"** button speaks the story in the phone's own built-in voice — nothing is recorded or sent anywhere; the words never leave the device. Tap again to stop.

**Ember only.** The only AI in this project is Muse Ember: the storyteller Worker calls `muse-ember-1.0` and nothing else. Slime names are picked on the page itself, by the built-in name-maker. The live website's separate name-maker service (which runs on another model) is not part of this submission and is never called from these files. "Read it aloud" is the phone's own built-in voice, not a model. No other model is involved, and no other AI API is called.

**How the slime was troubleshot.** The slime play surface — the mesh that lets a child pull, stir, and squish the swirl — was troubleshot with help from Claude. Claude is not part of the running game; it only helped fix the play surface while we were building it. When a child plays, the only AI that is called is Muse Ember, for the story.

The story is generated fresh for every slime, so no two slimes get quite
the same story. The whole feature runs on Muse Ember — no other model is
involved.

**What's next.** Because of the result we had in this hackathon, we are
considering using Ember on our website — adding the Storyteller to the
live Slime Bar at belleflykids.com once the hackathon is done.

## Safety fallback: a child never sees a bad answer

Every story is checked before it reaches the screen:

- It must be exactly two sentences, short and preschool-friendly.
- It must only talk about the slime the child made — its colours, topping,
  and name.
- It must stay wholesome: kind, gentle, and cheerful, with no scary,
  sad, or grown-up content.

If Ember's reply fails any check, or if Ember is unreachable for any
reason, the game shows a ready-made canned story about that slime instead
— written in advance by the Bellefly Kids team, using the same colours,
topping, and name. The child always sees a kind story, and never sees an
error, a raw model reply, or a blank screen.

## Budget: pennies per story, inside the $10 cap

Muse Ember pricing (Meta Model API):

| | Price |
| --- | --- |
| Input | $0.10 per 1M tokens |
| Output | $0.50 per 1M tokens |

A typical story uses roughly 300 input tokens (the short prompt plus the
slime's colours, topping, and name) and roughly 60 output tokens (two
short sentences):

- Input: 300 × $0.10 / 1,000,000 ≈ $0.000030
- Output: 60 × $0.50 / 1,000,000 ≈ $0.000030
- **Total: about $0.00006 per story**

At that rate, the $10 hackathon credit covers roughly **160,000 stories**.
Every live call is logged with its token counts and cost — see
[docs/token-trace.md](docs/token-trace.md) — and the running total is
checked against the $10 cap. If the total ever approaches the cap, we
stop live calls and the feature runs on canned stories only.

## Repo layout

```
.
├── README.md                 # this file
├── LICENSE                   # MIT
├── .gitignore
├── docs/
│   ├── prompt.md             # exact prompt, validation rules, cost math
│   ├── token-trace.md        # token/cost trace (the hackathon record)
│   └── token-trace.jsonl     # one JSON line per live Ember call (empty until the first call)
├── worker/                   # Cloudflare Worker + node test harness
│   ├── drew-slime-storyteller.js   # the Worker: prompt, Ember call, safety checks
│   └── test-storyteller.mjs        # test harness (dry-run vs live)
├── demo/                     # demo pages with the story button
│   ├── drews-slime-bar-with-story.html   # full game copy with the story feature
│   ├── demo.html             # lightweight standalone demo page
│   └── assets/drew.png       # Drew reference image
```

## How to deploy the Worker

The Worker is a single small file pasted into the Cloudflare dashboard —
no build step, no repo checkout needed on the dashboard side.

1. **Create the API key (Chalette does this step).** In the Meta Model API
   console, create a key for the Muse Ember project. Keep it private —
   it never goes into this repo, into chat, or into any file.
2. In the Cloudflare dashboard, open the Worker (or create a new one) and
   paste in the code from `worker/`.
3. Set the secret: in the Worker's **Settings → Variables**, add a secret
   named `META_API_KEY` with the key from step 1.
4. Deploy.

Deployment only happens with Chalette's explicit yes, and only after the
dry-run tests pass (see below).

## How to run the tests

The test harness lives in `worker/` and runs with node. It has two modes:

```bash
# Dry-run (default): no live calls, no cost. Uses canned Ember replies to
# check the prompt shape, the two-sentence rule, the safety checks, and
# the fallback. 48 checks.
node worker/test-storyteller.mjs

# Live: calls the deployed Worker for 3 fixed test recipes and appends
# each call's tokens and cost to docs/token-trace.jsonl and
# docs/token-trace.md. Refuses to run unless the $10 credits are confirmed
# on the Billing page (EMBER_CREDITS_CONFIRMED=1). Only run with
# Chalette's yes, and only against the deployed Worker URL.
EMBER_CREDITS_CONFIRMED=1 STORYTELLER_URL=https://<worker>/api/story node worker/test-storyteller.mjs --live
```

Dry-run must pass before any live run, and a live run must stay well
inside the $10 cap — the trace file is the proof.

## Where the prompt and token trace live

- **The prompt** (the exact words sent to Ember, plus the safety rules)
  lives in the Worker source in `worker/`, is written out in full in
  [docs/prompt.md](docs/prompt.md), and is quoted in full in
  [docs/token-trace.md](docs/token-trace.md).
- **The token trace** is [docs/token-trace.md](docs/token-trace.md)
  (human-readable table and running total) backed by
  [docs/token-trace.jsonl](docs/token-trace.jsonl) (one JSON object per
  live call: timestamp, recipe, model, input/output tokens, cost, running
  total). The test harness appends to both after every live call.

## For parents: privacy

- Only button picks and Drew's generated name leave the device: slime
  colours, topping, and the slime's name.
- A name typed in the box stays on the picture only — it is never sent
  or stored. No name, photo, voice, location, or personal detail is
  ever sent or stored.
- No account, no sign-in, no ads, no tracking.
- Stories are generated fresh per slime and are not kept after the visit,
  except for the anonymous token/cost log (token counts and cost only —
  no slime names, no personal data) that proves the hackathon budget.

## About Bellefly Kids

Bellefly Kids is created by Chalette Hodge — children's author,
songwriter, and creator of joyful, wholesome stories, songs, and learning
play for young children and their families. Find the games and stories at
https://belleflykids.com.

Drew is the little blue spider: a cheerful little spider with soft fuzzy
bright-blue fur, big sparkly blue eyes, and a sparkly blue bow tie with a
purple heart-shaped gem. He hosts the Slime Bar and tells the stories.
