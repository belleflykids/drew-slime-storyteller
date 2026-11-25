# Drew's Slime Storyteller — token trace

Live Ember usage for the hackathon entry. Costs at $0.10 per 1M input tokens and $0.50 per 1M output tokens. Model: muse-ember-1.0.

Budget cap for live testing: $9.00. The harness aborts before total spend would pass it.

| Calls | Input tokens | Output tokens | Total spend (USD) | Budget left (USD) |
|---:|---:|---:|---:|---:|
| 3 | 812 | 531 | $0.000347 | $8.999653 |

Last updated: 2026-11-25T09:58:40Z (UTC).
Per-call detail lives in token-trace.jsonl (one JSON line per call).

Notes: the Ocean Blue recipe failed twice before passing — once on a network fetch failure from the test machine ($0, no model call) and once with a 502 (the model's story failed the server-side check twice inside the Worker; those model tokens are in the Worker logs, not in the 502 response, estimated under $0.0002). True total spend including the 502 attempt is still under $0.001. The Worker also verified two assumptions on the first live calls: Ember accepts `reasoning_effort: "minimal"`, and the usage fields are `prompt_tokens` / `completion_tokens` as assumed.

Live game use: on 24 Nov ~23:57 HST Chalette tap-tested the game on her phone (Snowy White base, Drew Blue syrup, Jelly Cubes topping, name "Swirly White Swirl") and the live Ember story showed on screen: "Your Swirly White Swirl is soft and snowy white with pretty Drew Blue swirls all around. The Jelly Cubes on top sparkle like little candies for a fun pretend play hug." Exact tokens for that call are in the Worker logs; estimated ~$0.0001 from the three measured calls, so true total spend is still under $0.001.
