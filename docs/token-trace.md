# Token trace — Drew's Slime Storyteller

**No live Muse Ember calls have been made yet — the $10 credits are claimed but not yet confirmed on the Billing page.**

This file is the hackathon record for Drew's Slime Storyteller: the prompt
sent to Muse Ember, and every live call's tokens and cost. It proves the
feature runs entirely on Muse Ember (`muse-ember-1.0`, via the Meta Model
API) and stays inside the $10 credit cap.

## The prompt

The exact system prompt sent to Muse Ember, built from the recipe by
`buildSystemPrompt` in `worker/drew-slime-storyteller.js` (also written
out in full in [docs/prompt.md](prompt.md)). Placeholders: `{name}`,
`{base}`, `{syrups}`, `{toppings}`. When a recipe has no topping, the
topping rule is left out.

```
You are Drew, a cute fluffy little blue spider with soft fuzzy bright-blue fur, two big sparkly blue eyes with long lashes, a big happy smile, and a sparkly blue bow tie with a purple heart-shaped gem in the centre. You host a slime bar for little children in the Bellefly Kids Garden.
A child just finished making a pretend slime. Tell a tiny story about it, just for them.
Slime — name: {name}; base: {base}; colours: {syrups}; toppings: {toppings}.
Rules, all mandatory:
- Tell a story of exactly TWO sentences. No more, no fewer.
- Mention the slime's name, its colours, and its topping.
- Warm, gentle, playful words a preschool child would love. Simple words, short sentences.
- Kind and wholesome only. No upsetting, unkind, or hurtful words. No fights, no strangers, no secrets.
- Never use any word from the banned-words list.
- No seasonal celebration themes. No religious symbols.
- Never tell the child how to make real slime. This is pretend play only.
- Return ONLY JSON, no other text: {"story": "..."}
```

The user message is `Tell the story about my slime.` (on retry, the
broken rule is named). The prompt does not spell the banned words out —
enforcement is server-side: every answer is checked word by word
against the banned-word lists before anything is returned, and the game
checks the story once more before showing it.

## Pricing

| | Price |
| --- | --- |
| Input | $0.10 per 1M tokens |
| Output | $0.50 per 1M tokens |

Per-story cost: about **$0.00006** (roughly 300 input tokens + roughly
60 output tokens). $10 covers roughly 160,000 stories.

## How the trace is updated

After every live Ember call, the test harness (`worker/test-storyteller.mjs`) appends one JSON
line to `token-trace.jsonl` and updates the table below, including the
running total. Dry-run calls are never logged here — only real calls
that cost real credit. If the running total ever approaches $10, the
feature switches to canned stories only until more credit is added.

## Per-line JSON schema (`token-trace.jsonl`)

One JSON object per line, one line per live call:

```json
{
  "timestamp": "2026-11-24T22:00:00Z",
  "recipe": {
    "colours": ["Really Red", "Drew Blue"],
    "topping": "Gummy Worms",
    "slime_name": "Snowy Pink Bubble Pop"
  },
  "model": "muse-ember-1.0",
  "input_tokens": 150,
  "output_tokens": 60,
  "cost_usd": 0.000045,
  "running_total_usd": 0.000045
}
```

Field notes:

- `timestamp` — UTC ISO 8601 time of the call.
- `recipe` — the exact button picks sent: slime colours, topping, and
  the slime's name. No child's name, no personal detail, nothing typed.
- `model` — always `muse-ember-1.0`.
- `input_tokens` / `output_tokens` — token counts reported by the API
  for that call.
- `cost_usd` — `input_tokens × 0.10 / 1,000,000 + output_tokens × 0.50 / 1,000,000`,
  rounded to 6 decimal places.
- `running_total_usd` — cumulative spend including this call.

## Calls

| Timestamp (UTC) | Recipe (colours + topping + name) | Model | In | Out | Cost (USD) | Running total (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| _none yet_ | — | — | — | — | — | **$0.000000** |

**Running total: $0.00 — no live calls yet.**
