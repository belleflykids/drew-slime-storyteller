// Drew's Slime Storyteller — test harness (Node, no dependencies)
// ============================================================================
// Two modes:
//   node test-storyteller.mjs --dry-run   (default) — NO network calls at
//     all. Validates prompt building, request validation, story validation,
//     cost math, and the retry-then-fallback path using canned model
//     responses fed through the Worker's own pure functions.
//   node test-storyteller.mjs --live      — calls a deployed Worker URL from
//     env STORYTELLER_URL. REFUSES to run unless env EMBER_CREDITS_CONFIRMED
//     is set to "1". Sends 3 fixed test recipes, prints each story +
//     usage, appends one JSON line per call to ../docs/token-trace.jsonl,
//     updates ../docs/token-trace.md running totals, prints total spend,
//     and ABORTS if total spend would pass $9.00.
//
// Run from this directory:  node test-storyteller.mjs
// Live example:
//   EMBER_CREDITS_CONFIRMED=1 STORYTELLER_URL=https://<worker>/api/story \
//     node test-storyteller.mjs --live

import {
  MODEL,
  BANNED,
  ANSWER_BANNED_WORDS,
  ANSWER_BANNED_PHRASES,
  computeCost,
  validateRecipe,
  buildSystemPrompt,
  checkStory,
  parseModelText
} from "./drew-slime-storyteller.js";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "..", "docs");
const TRACE_JSONL = path.join(DOCS_DIR, "token-trace.jsonl");
const TRACE_MD = path.join(DOCS_DIR, "token-trace.md");
const BUDGET_LIMIT_USD = 9.0;
// Worst-case cost of one story call, used for the pre-call budget guard:
// 1000 input tokens + 200 output tokens (the max_tokens cap).
const WORST_CASE_CALL_USD = computeCost(1000, 200);

const SAMPLE_RECIPE = {
  name: "Snowy Pink Bubble Pop",
  base: "Snowy White",
  syrups: ["Bubblegum Pink"],
  toppings: ["Gummy Worms"]
};

// A valid two-sentence story (37 words) containing the slime name.
const GOOD_STORY =
  "Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls that wiggles and giggles in the garden. " +
  "Drew gives it a gentle pat and says it is the sweetest slime friend ever made today.";

// ---------------------------------------------------------------- dry-run ---

let passed = 0;
let failed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log("PASS  " + label);
  } else {
    failed += 1;
    failures.push(label + (detail ? " — " + detail : ""));
    console.log("FAIL  " + label + (detail ? " — " + detail : ""));
  }
}

function promptTokens(prompt) {
  return prompt.toLowerCase().replace(/[^a-z]+/g, " ").split(/\s+/).filter(Boolean);
}

// Mirror of the Worker's one-retry policy, driven by canned model texts.
// Returns { outcome: "success", story } after at most 2 attempts, or
// { outcome: "fallback" } when both attempts fail — the game then shows
// its canned story and the child never sees a bad answer.
function simulateAttempts(cannedTexts, recipe) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = cannedTexts[attempt];
    if (text === undefined) return { outcome: "fallback" };
    const parsed = parseModelText(text, recipe.name);
    if (parsed.ok) return { outcome: "success", story: parsed.story, attempts: attempt + 1 };
  }
  return { outcome: "fallback" };
}

function runDryRun() {
  console.log("Drew's Slime Storyteller — dry run (no network calls)\n");

  // --- 1. Prompt building -----------------------------------------------
  const prompt = buildSystemPrompt(SAMPLE_RECIPE);
  check("prompt contains the slime name", prompt.includes(SAMPLE_RECIPE.name));
  check("prompt contains the base", prompt.includes(SAMPLE_RECIPE.base));
  check("prompt contains the syrup colour", prompt.includes("Bubblegum Pink"));
  check("prompt contains the topping", prompt.includes("Gummy Worms"));
  check("prompt demands exactly two sentences", prompt.toLowerCase().includes("exactly two sentences"));
  check("prompt demands JSON only", prompt.includes('{"story": "..."}'));
  check("prompt says pretend play only", prompt.toLowerCase().includes("pretend play only"));
  check("prompt forbids real-slime instructions", prompt.toLowerCase().includes("never tell the child how to make real slime"));
  check("prompt names Drew and her look", prompt.includes("Drew") && prompt.includes("sparkly blue bow tie"));
  const tokens = promptTokens(prompt);
  const promptBanned = tokens.filter((t) => ANSWER_BANNED_WORDS.includes(t));
  check("prompt has no banned word", promptBanned.length === 0, "found: " + promptBanned.join(", "));
  const paddedPrompt = " " + tokens.join(" ") + " ";
  const promptPhrases = ANSWER_BANNED_PHRASES.filter((p) => paddedPrompt.includes(" " + p + " "));
  check("prompt has no banned phrase", promptPhrases.length === 0, "found: " + promptPhrases.join(", "));
  const noToppingPrompt = buildSystemPrompt({ name: "Snowy Blue Swirl", base: "Snowy White", syrups: ["Drew Blue"], toppings: [] });
  check("prompt without toppings drops the topping rule", !noToppingPrompt.toLowerCase().includes("and its topping"));

  // --- 2. Request validation ---------------------------------------------
  const valid = validateRecipe({ ...SAMPLE_RECIPE });
  check("valid recipe passes", !!valid.recipe && !valid.error);
  check("extra field rejected", !!validateRecipe({ ...SAMPLE_RECIPE, shape: "Star" }).error);
  check("missing name rejected", !!validateRecipe({ base: "Snowy White", syrups: [], toppings: [] }).error);
  check("missing base rejected", !!validateRecipe({ name: "Snowy Pink Bubble Pop", syrups: [], toppings: [] }).error);
  check("name over 40 chars rejected", !!validateRecipe({ ...SAMPLE_RECIPE, name: "A".repeat(41) }).error);
  check("banned substring in a value rejected",
    !!validateRecipe({ ...SAMPLE_RECIPE, base: "Snowy " + BANNED[0] + " White" }).error);
  check("3 syrups rejected", !!validateRecipe({ ...SAMPLE_RECIPE, syrups: ["A", "B", "C"] }).error);
  check("2 syrups accepted", !!validateRecipe({ ...SAMPLE_RECIPE, syrups: ["Bubblegum Pink", "Lime Pop"] }).recipe);
  check("5 toppings rejected", !!validateRecipe({ ...SAMPLE_RECIPE, toppings: ["A", "B", "C", "D", "E"] }).error);
  check("4 toppings accepted", !!validateRecipe({ ...SAMPLE_RECIPE, toppings: ["A", "B", "C", "D"] }).recipe);
  check("non-string base rejected", !!validateRecipe({ ...SAMPLE_RECIPE, base: 42 }).error);
  check("syrups not an array rejected", !!validateRecipe({ ...SAMPLE_RECIPE, syrups: "Bubblegum Pink" }).error);
  check("null body rejected", !!validateRecipe(null).error);
  check("array body rejected", !!validateRecipe([]).error);

  // --- 3. Story validation -------------------------------------------------
  const good = checkStory(GOOD_STORY, SAMPLE_RECIPE.name);
  check("good story passes", !!good.story, good.reason || "");
  check("name match is case-insensitive",
    !!checkStory(GOOD_STORY.toLowerCase(), SAMPLE_RECIPE.name).story);
  check("one-sentence story rejected",
    checkStory("Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls that wiggles in the garden all day long.", SAMPLE_RECIPE.name).reason === "story is not exactly two sentences");
  check("three-sentence story rejected",
    checkStory(
      "Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls that wiggles in the garden. " +
      "Drew gives it a gentle pat and a warm smile. " +
      "All the garden friends come to say hello to the sweetest slime today.",
      SAMPLE_RECIPE.name).reason === "story is not exactly two sentences");
  check("question mark rejected",
    checkStory(
      "Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls that wiggles in the garden today. " +
      "Do you want to play with the sweetest slime friend ever made today?",
      SAMPLE_RECIPE.name).reason === "story is a question");
  check("too-short story rejected",
    checkStory("Snowy Pink Bubble Pop is soft and pink. Drew loves it lots.",
      SAMPLE_RECIPE.name).reason === "story is not 25-60 words");
  const longStory =
    "Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls that wiggles and giggles in the garden all day long with all of its dear friends, bouncing and bobbing in the warm bright sunshine. " +
    "Drew gives it a gentle pat and says it is the sweetest slime friend ever made today in the whole wide garden under the warm sun.";
  check("too-long story rejected (>60 words)",
    checkStory(longStory, SAMPLE_RECIPE.name).reason === "story is not 25-60 words");
  check("digits rejected",
    checkStory(
      "Snowy Pink Bubble Pop is a soft white slime with 2 pretty pink swirls that wiggles and giggles in the garden. " +
      "Drew gives it a gentle pat and says it is the sweetest slime friend ever made today.",
      SAMPLE_RECIPE.name).reason === "digits in story");
  check("link rejected",
    checkStory(
      "Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls that wiggles and giggles in the garden at www.example.com. " +
      "Drew gives it a gentle pat and says it is the sweetest slime friend ever made today.",
      SAMPLE_RECIPE.name).reason === "link in story");
  check("story without the slime name rejected",
    checkStory(
      "A soft white slime with pretty pink swirls wiggles and giggles in the garden with all of its dear friends today. " +
      "Drew gives it a gentle pat and says it is the sweetest slime friend ever made today.",
      SAMPLE_RECIPE.name).reason === "story does not contain the slime name");
  const bannedWordStory =
    "Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls and a " + ANSWER_BANNED_WORDS[0] + " wiggle that giggles in the garden. " +
    "Drew gives it a gentle pat and says it is the sweetest slime friend ever made today.";
  check("banned word rejected",
    (checkStory(bannedWordStory, SAMPLE_RECIPE.name).reason || "").startsWith("banned word:"));
  const bannedPhraseStory =
    "Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls that wiggles and giggles in the garden for the " + ANSWER_BANNED_PHRASES[0] + " party. " +
    "Drew gives it a gentle pat and says it is the sweetest slime friend ever made today.";
  check("banned phrase rejected",
    (checkStory(bannedPhraseStory, SAMPLE_RECIPE.name).reason || "").startsWith("banned phrase:"));

  // --- 4. Model-text parsing (canned responses) ---------------------------
  const parsedGood = parseModelText(JSON.stringify({ story: GOOD_STORY }), SAMPLE_RECIPE.name);
  check("canned good JSON parses and passes", parsedGood.ok === true && parsedGood.story === GOOD_STORY);
  const parsedBadJson = parseModelText("This is not JSON at all.", SAMPLE_RECIPE.name);
  check("canned bad JSON rejected", parsedBadJson.ok === false && parsedBadJson.reason === "model returned bad JSON");
  const parsedMissing = parseModelText(JSON.stringify({ sentence: GOOD_STORY }), SAMPLE_RECIPE.name);
  check("canned JSON without a story field rejected",
    parsedMissing.ok === false && parsedMissing.reason === "bad format: no story field");

  // --- 5. Retry-then-fallback path (canned responses) ----------------------
  const oneSentenceJson = JSON.stringify({
    story: "Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls that wiggles in the garden all day long."
  });
  const goodJson = JSON.stringify({ story: GOOD_STORY });
  const retryThenSuccess = simulateAttempts(["This is not JSON at all.", goodJson], SAMPLE_RECIPE);
  check("retry after bad JSON can succeed", retryThenSuccess.outcome === "success" && retryThenSuccess.attempts === 2);
  const retryThenFail = simulateAttempts(["This is not JSON at all.", oneSentenceJson], SAMPLE_RECIPE);
  check("two bad answers fall back (game shows canned story)", retryThenFail.outcome === "fallback");
  const firstTrySuccess = simulateAttempts([goodJson], SAMPLE_RECIPE);
  check("good first answer needs no retry", firstTrySuccess.outcome === "success" && firstTrySuccess.attempts === 1);
  const cannedFallback =
    "Snowy Pink Bubble Pop is a soft white slime with pretty pink swirls that wiggles and giggles in the garden. " +
    "Drew gives it a gentle pat and says it is the sweetest slime friend ever made today.";
  check("canned fallback story itself passes validation", !!checkStory(cannedFallback, SAMPLE_RECIPE.name).story);

  // --- 6. Cost math ---------------------------------------------------------
  check("cost math: 300 in / 60 out = $0.00006",
    Math.abs(computeCost(300, 60) - 0.00006) < 1e-9, "got " + computeCost(300, 60));
  check("cost math: zero tokens = $0", computeCost(0, 0) === 0);
  check("cost math: 1M in / 1M out = $0.60",
    Math.abs(computeCost(1000000, 1000000) - 0.6) < 1e-9, "got " + computeCost(1000000, 1000000));

  console.log("\nDry run: " + passed + " passed, " + failed + " failed.");
  if (failed > 0) {
    console.log("Failures:\n- " + failures.join("\n- "));
    process.exitCode = 1;
  } else {
    console.log("All dry-run checks passed. No network calls were made.");
  }
}

// ------------------------------------------------------------------- live ---

const LIVE_RECIPES = [
  { name: "Snowy Pink Bubble Pop", base: "Snowy White", syrups: ["Bubblegum Pink"], toppings: ["Gummy Worms"] },
  { name: "Ocean Blue Bubble Pop", base: "Really Red", syrups: ["Drew Blue"], toppings: ["Glitter"] },
  { name: "Sunny Lemon Swirl", base: "Sunny Yellow", syrups: ["Lime Pop"], toppings: ["Foam Beads", "Glitter"] }
];

async function readPriorSpend() {
  if (!existsSync(TRACE_JSONL)) return { calls: 0, inputTokens: 0, outputTokens: 0, spend: 0 };
  const text = await readFile(TRACE_JSONL, "utf8");
  const totals = { calls: 0, inputTokens: 0, outputTokens: 0, spend: 0 };
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (typeof entry.cost_usd === "number") {
        totals.calls += 1;
        totals.inputTokens += entry.input_tokens || 0;
        totals.outputTokens += entry.output_tokens || 0;
        totals.spend += entry.cost_usd;
      }
    } catch (e) { /* skip a malformed trace line */ }
  }
  return totals;
}

async function updateTraceMd(totals) {
  const remaining = Math.max(0, BUDGET_LIMIT_USD - totals.spend);
  const md = [
    "# Drew's Slime Storyteller — token trace",
    "",
    "Live Ember usage for the hackathon entry. Costs at $0.10 per 1M input tokens and $0.50 per 1M output tokens. Model: " + MODEL + ".",
    "",
    "Budget cap for live testing: $" + BUDGET_LIMIT_USD.toFixed(2) + ". The harness aborts before total spend would pass it.",
    "",
    "| Calls | Input tokens | Output tokens | Total spend (USD) | Budget left (USD) |",
    "|---:|---:|---:|---:|---:|",
    "| " + totals.calls + " | " + totals.inputTokens + " | " + totals.outputTokens + " | $" + totals.spend.toFixed(6) + " | $" + remaining.toFixed(6) + " |",
    "",
    "Last updated: " + new Date().toISOString() + " (UTC).",
    "Per-call detail lives in token-trace.jsonl (one JSON line per call).",
    ""
  ].join("\n");
  await writeFile(TRACE_MD, md, "utf8");
}

async function runLive() {
  if (process.env.EMBER_CREDITS_CONFIRMED !== "1") {
    console.error("REFUSED: live mode needs EMBER_CREDITS_CONFIRMED=1.");
    console.error("The $10 hackathon credit has not been confirmed on the Billing page yet.");
    console.error("Do not work around this gate. Run --dry-run instead.");
    process.exit(2);
  }
  const url = process.env.STORYTELLER_URL;
  if (!url) {
    console.error("REFUSED: live mode needs STORYTELLER_URL set to the deployed Worker URL.");
    process.exit(2);
  }
  console.log("Live mode — Worker: " + url);
  const totals = await readPriorSpend();
  console.log("Prior spend from token-trace.jsonl: $" + totals.spend.toFixed(6) + " across " + totals.calls + " calls.");
  let anyFailure = false;

  for (const recipe of LIVE_RECIPES) {
    if (totals.spend + WORST_CASE_CALL_USD > BUDGET_LIMIT_USD) {
      console.error("ABORTED: next call could push total spend past $" + BUDGET_LIMIT_USD.toFixed(2) +
        " (spend so far $" + totals.spend.toFixed(6) + "). Stopping before any further charge.");
      process.exitCode = 3;
      return;
    }
    console.log("\n— " + recipe.name + " —");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let entry;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
        signal: controller.signal
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error("Worker answered " + resp.status + ": " + JSON.stringify(data));
        entry = { ts: new Date().toISOString(), model: MODEL, recipe: recipe.name, ok: false, error: "HTTP " + resp.status, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
        anyFailure = true;
      } else {
        console.log("Story: " + data.story);
        console.log("Usage: " + JSON.stringify(data.usage));
        entry = {
          ts: new Date().toISOString(),
          model: MODEL,
          recipe: recipe.name,
          ok: true,
          input_tokens: data.usage?.input_tokens ?? 0,
          output_tokens: data.usage?.output_tokens ?? 0,
          cost_usd: data.usage?.cost_usd ?? 0
        };
        totals.calls += 1;
        totals.inputTokens += entry.input_tokens;
        totals.outputTokens += entry.output_tokens;
        totals.spend += entry.cost_usd;
      }
    } catch (e) {
      console.error("Call failed: " + (e?.name === "AbortError" ? "timed out after 15s" : String(e)));
      entry = { ts: new Date().toISOString(), model: MODEL, recipe: recipe.name, ok: false, error: "request failed", input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      anyFailure = true;
    } finally {
      clearTimeout(timer);
    }
    await appendFile(TRACE_JSONL, JSON.stringify(entry) + "\n", "utf8");
    await updateTraceMd(totals);
    if (totals.spend > BUDGET_LIMIT_USD) {
      console.error("ABORTED: total spend $" + totals.spend.toFixed(6) + " passed the $" + BUDGET_LIMIT_USD.toFixed(2) + " cap. Stopping.");
      process.exitCode = 3;
      return;
    }
  }

  console.log("\nLive run done. Total spend (all live calls to date): $" + totals.spend.toFixed(6) +
    " across " + totals.calls + " calls. Budget left: $" + Math.max(0, BUDGET_LIMIT_USD - totals.spend).toFixed(6) + ".");
  if (anyFailure) process.exitCode = 1;
}

// ------------------------------------------------------------------ main ---

const args = process.argv.slice(2);
if (args.includes("--live")) {
  await runLive();
} else {
  runDryRun();
}
