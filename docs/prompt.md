# Drew's Slime Storyteller — prompt, validation, retry, fallback, cost

Model: `muse-ember-1.0` via the Meta Model API only, endpoint
`https://api.meta.ai/v1/chat/completions`. Model settings: `max_tokens`
200, `temperature` 0.8. See "Assumptions to verify" for the
`reasoning_effort` field.

## Exact system prompt

The Worker builds this prompt from the recipe (`buildSystemPrompt` in
`worker/drew-slime-storyteller.js`). Placeholders: `{name}`, `{base}`,
`{syrups}`, `{toppings}`. When the recipe has no toppings, the
"topping" rule is left out (a story cannot mention a topping that
does not exist).

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

The user message is `Tell the story about my slime.` (or, on retry,
`Tell the story again. ` plus the retry note — see "Retry policy").

### Why the prompt does not spell the banned words out

The prompt tells the model to avoid "the banned-words list" without
listing its words. The real enforcement is server-side: every answer
is checked word by word against the banned-word and banned-phrase
lists (reused verbatim from the namer Worker) before anything is
returned, and the game checks the story once more before showing it.
Keeping the listed words out of the prompt text is deliberate.

### Drew's look

Locked look, used in the prompt persona: a cute fluffy little blue
spider with soft fuzzy bright-blue fur, two big sparkly blue eyes with
long lashes, a big happy smile, wearing a sparkly blue bow tie with a
purple heart-shaped gem in the centre. She hosts the slime bar in the
Bellefly Kids Garden. (The current reference image has forehead dots
that are part of the approved look — the prompt does not describe any
eyes beyond the locked description above.)

## Request validation (before any API call)

Endpoint: `POST /api/story`. Only these four fields are accepted;
anything else → 400:

```json
{"name": "Snowy Pink Bubble Pop", "base": "Snowy White", "syrups": ["Bubblegum Pink"], "toppings": ["Gummy Worms"]}
```

- `name` — required, short text, at most 40 characters.
- `base` — required, short text, at most 40 characters.
- `syrups` — array, at most 2 items, each at most 40 characters.
- `toppings` — array, at most 4 items, each at most 40 characters.
- Every value is checked for banned words (loose substring check, same
  small list as the namer Worker). A value that fails is rejected with
  400 before any model call is made.
- Only button picks from the game are ever sent — no free text from a
  child reaches the model.

Other responses: 405 for a non-POST method; 503 with
`AI not connected yet — credit/key pending` when `env.META_API_KEY`
is missing (no key, no call, no charge); 429 when a rate limit is hit.

## Story validation (server-side, on every model answer)

The story must pass ALL of these, or it is rejected:

1. Exactly 2 sentence terminators (`.` or `!`), and no question mark.
   The story must end with a period.
2. 25–60 words total.
3. No digits.
4. No links (no `http`, `www.`, `.com`, `.net`, `.org`, `@`).
5. No banned words, checked word by word against the reused
   banned-word list; no banned phrases, checked against the reused
   banned-phrase list.
6. The story MUST contain the slime's name (case-insensitive), so a
   story can never be swapped onto the wrong slime.
7. The answer must be JSON only: `{"story": "..."}`. Anything else —
   bad JSON, a missing `story` field — is rejected.

Colour and topping mentions are required by the prompt, not by the
server check; the server check enforces the name, length, shape, and
word lists above.

## Retry policy

One retry, and only on a format break: bad JSON, or a story that fails
the checks above. The retry message names the broken rule, e.g.
`Your last answer broke a format rule (story is not exactly two
sentences). Return ONLY the JSON object {"story": "..."} with exactly
two sentences, 25-60 words, containing the slime name "...".`
If the retry also fails, the Worker returns 502 and the game falls
back silently — a child never sees a bad answer. Upstream failures
(HTTP error, no text, timeout after 8 seconds) are NOT retried; they
go straight to 502.

## Fallback policy

- Worker returns 502 (`Meta AI returned no usable story`) → the game
  shows its built-in canned story and never shows the live answer.
- Worker returns 400 / 429 / 503 → the game also falls back silently.
- The Worker itself never invents a story: it either returns a
  validated model story or an error. The canned story lives in the
  game, not in the Worker.

## Cost math

- Input: $0.10 per 1M tokens. Output: $0.50 per 1M tokens.
- `cost_usd = input_tokens × 0.10 / 1,000,000 + output_tokens × 0.50 / 1,000,000`, rounded to 8 decimal places.
- A two-sentence story is roughly 300 input / 60 output tokens:
  `300 × 0.10 / 1e6 + 60 × 0.50 / 1e6 = 0.00003 + 0.00003 = $0.00006` per story.
- Worst case per call (200 output tokens, the `max_tokens` cap):
  about $0.00013. At that rate the $9.00 live-test budget covers
  roughly 69,000 stories — the budget is a guard rail, not a limit the
  build is anywhere near.
- Success response carries the usage block the token trace is built
  from:

```json
{"story": "...", "usage": {"model": "muse-ember-1.0", "input_tokens": 300, "output_tokens": 60, "cost_usd": 0.00006}}
```

## Rate limits and logging

- 10 requests per minute per IP, 100 per day per IP, 500 per day total
  across everyone. IPs are SHA-256 hashed first and never stored raw.
  Limits are kept in memory, so they are best-effort per server.
- Every model call is logged as one JSON line: event `model_call`,
  model, `input_tokens`, `output_tokens`, `cost_usd`, `ok`, and `reason`
  when it failed. Rejections (`story_rejection`), retries
  (`model_retry`), and rate-limit hits (`rate_limited`) are logged the
  same way, with the rejected text truncated to 120 characters. No raw
  IPs, no child data — only the reason and the rejected text.
- The test harness appends one JSON line per live call to
  `docs/token-trace.jsonl` and keeps running totals in
  `docs/token-trace.md`.

## Verified on the first live test (24 Nov 2026)

1. **`reasoning_effort: "minimal"`** — VERIFIED: Ember accepts the field; all three live stories returned with it set.
2. **Usage fields** — VERIFIED: the Worker reads `data.usage.prompt_tokens` and `data.usage.completion_tokens`, and the live responses carried them as assumed.
3. **Prompt wording** — VERIFIED: the three live stories each came back as exactly two sentences, named the slime, and fell in the 25–60 word range; the server validator passed them (Ocean Blue needed one retry after a network failure and one 502, then passed).
4. **Credit source** — live testing uses only the $10 hackathon credit, confirmed on the Billing page 24 Nov (free credits in use $159.90). The older credit balance is never used for this project. The harness enforces this with the `EMBER_CREDITS_CONFIRMED=1` gate and the $9.00 cap.
