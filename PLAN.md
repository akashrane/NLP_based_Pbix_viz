# Plan — Natural-Language-to-Chart Power BI Custom Visual

## 1. Goal and success criteria

Deliver a packaged Power BI custom visual (`.pbiviz`) that:

1. Renders a text input inside the visual where the user types an English question.
2. Parses the question into a `{chartType, targetField(s)}` intent.
3. Renders one of three supported chart types from the bound data.
4. Shows a clear, in-visual message when the intent is unclear or the referenced field is not present in the current data binding.

Acceptance looks like this: import `.pbiviz` into Power BI Desktop, drag fields from `dummy.xlsx` into the visual's data wells, type each demo query below, and see the expected chart.

| Demo query | Expected intent | Expected chart |
|---|---|---|
| "What's the distribution of GPA?" | histogram, field = GPA | Histogram |
| "Show enrollment by department" | bar, x = Department, y = Enrollment | Bar |
| "Trend of response rate over semesters" | line, x = Year_Semester, y = Response Rate % | Line |
| "Distribution of overall teaching effectiveness" | histogram, field = FF_Instructors_overall_teaching_effectiveness | Histogram |
| "Plot the moon phase by instructor" | no intent / field missing | Friendly error text |

## 2. Current state of the scaffold

The `myVisual/` folder already contains a working `pbiviz` project:

- `package.json` pulls in `powerbi-visuals-api ~5.3.0`, `d3 7.9.0`, and `powerbi-visuals-utils-formattingmodel`. Good base — no framework changes needed.
- `capabilities.json` has two data roles: `category` (Grouping) and `measure` (Measure), with a `categorical` mapping that binds at most one measure. This is too narrow for NL-driven field selection; it will be expanded (see §5).
- `src/visual.ts` is the default "Update count" boilerplate; it will be replaced wholesale.
- `src/settings.ts` has a `dataPoint` formatting card that we'll keep and extend with a "parser mode" toggle and a "Gemini API key" secure field (optional).

Nothing in the scaffold is blocking; all changes are additive or localized to these files.

## 3. Proposed architecture

Four small modules inside `src/`:

```
src/
├── visual.ts              // IVisual lifecycle: host, update(), DOM wiring
├── settings.ts            // Formatting pane (existing + new parser/LLM cards)
├── ui/
│   ├── inputBar.ts        // Renders the textbox + submit, emits a query event
│   └── errorPanel.ts      // Renders friendly failure messages
├── nlp/
│   ├── intentParser.ts    // Rule-based parser (primary)
│   ├── geminiClient.ts    // Optional LLM fallback using fetch()
│   └── fieldMatcher.ts    // Fuzzy match query tokens to bound field names
└── charts/
    ├── histogram.ts       // d3-based histogram
    ├── bar.ts             // d3-based grouped/simple bar
    └── line.ts            // d3-based line chart
```

Runtime flow on submit:

1. `inputBar` captures the query string.
2. `intentParser` returns `{chartType, fieldHints}` or `null`.
3. `fieldMatcher` resolves `fieldHints` against the columns currently in `options.dataViews[0]`.
4. Dispatcher picks the right chart renderer and draws into the visual's root element.
5. On any failure, `errorPanel` renders the reason (unknown intent, no matching field, field type incompatible with chart).

Keeping NLP and rendering separate makes each piece independently testable and swappable (rule-based → Gemini → something else later).

## 4. Step-by-step implementation plan

### Phase 0 — Environment check (≈15 min)

- Verify `pbiviz` CLI works: `cd myVisual && npm install && npx pbiviz --version`.
- Install and trust the dev cert: `npx pbiviz --install-cert`.
- Smoke-test `npm start` and confirm the default visual loads in Power BI Desktop's "Developer Visual" tile.

### Phase 1 — Data binding and capabilities (≈45 min)

Update `capabilities.json` so the visual can receive any number of numeric and categorical fields, which is what the NL layer needs to choose from:

- Keep the `category` role, change to `kind: GroupingOrMeasure` is not needed — instead define **two roles**:
  - `category` (Grouping) — accepts multiple columns for x-axis/group-by candidates.
  - `measure` (Measure) — accepts multiple columns for numeric candidates; change `values.select` to `values.for: { in: "measure" }` so multiple measures can be bound.
- Add a `suppressDefaultTitle` object and an `objects.parser` block for a "Use LLM fallback" toggle and a secure "Gemini API key" string.
- Keep `dataReductionAlgorithm.top` reasonable (e.g., `count: 10000`) so histograms have enough rows.

At the end of this phase, the Power BI "Fields" pane for the visual will show two wells — `Category Data` and `Measure Data` — each accepting multiple fields from `dummy.xlsx`.

### Phase 2 — UI shell in `visual.ts` (≈1 hr)

- Replace the boilerplate `update()` with a single-mount pattern: create a root `<div class="nlviz">` on construction with a header (text input + submit button) and a body (`<div class="nlviz-canvas">`).
- In `update()`, stash the latest `dataView` on `this.lastDataView`. Re-render only when the user submits a query, not on every data update; a data refresh with an active query should re-run the last intent against the new data.
- Keyboard UX: Enter submits; Escape clears the chart; a small "?" button shows example queries.
- Resize: use `options.viewport` to recompute chart dimensions; debounce at ~100 ms.

### Phase 3 — Rule-based intent parser (≈2 hr)

`nlp/intentParser.ts` exports a pure function `parse(query: string, availableFields: FieldMeta[]): Intent | null`.

Chart-type keyword table (extend freely):

| Chart | Trigger phrases |
|---|---|
| `histogram` | "distribution", "spread", "histogram", "how is X distributed", "frequency of" |
| `line` | "trend", "over time", "by year", "by month", "by semester", "change in" |
| `bar` | "compare", "by", "across", "per", "top N", "highest/lowest" |

Parsing steps:

1. Lowercase, strip punctuation, tokenize.
2. Score each chart type against the token list; pick the highest scorer above a threshold; break ties with a priority order (`line > histogram > bar` when ambiguous, because "trend" and "distribution" are more specific than "by").
3. Extract candidate field phrases: everything after "of", "in", "for", "across", "by". Pass those to `fieldMatcher`.
4. Return `{chartType, xField?, yField?, valueField?}` or `null`.

`nlp/fieldMatcher.ts` does fuzzy matching against the display names of currently bound fields (`dataView.metadata.columns[i].displayName`). Start with normalized Levenshtein on tokens + acronym handling (e.g., "GPA" → "GPA", "teaching effectiveness" → `FF_Instructors_overall_teaching_effectiveness`). Return a ranked list; the top match must exceed a similarity threshold (≈0.55), else treat as "field not found".

### Phase 4 — Optional Gemini fallback (≈1 hr)

If the rule-based parser returns `null` and the formatting-pane toggle "Use LLM fallback" is on and an API key is set:

- `nlp/geminiClient.ts` calls `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=...` with a tight prompt:
  > "Classify the user query into JSON: {chart: 'histogram'|'bar'|'line'|'unknown', field_hints: string[]}. Query: «…». Available fields: […]. Respond with JSON only."
- Parse the JSON, validate the shape, and feed back into `fieldMatcher`.
- Power BI custom visuals are sandboxed but `fetch` to allow-listed hosts works when the visual is set to require HTTPS privileges — add `privileges: [{ name: 'WebAccess', essential: true, parameters: ['https://generativelanguage.googleapis.com'] }]` in `capabilities.json`.
- Fail soft: any LLM error falls back to the error panel, never crashes the visual.

### Phase 5 — Chart renderers (≈3 hr total)

All three renderers share a signature: `render(container: HTMLElement, data: RenderData, viewport: Viewport): void`. Use `d3` (already in deps).

- **Histogram** — `d3.bin()` on the chosen numeric field; x = bin edges, y = counts; configurable bin count (default: Freedman-Diaconis, capped at 30).
- **Bar** — group by x (categorical), aggregate y (numeric) with sum by default; mean when query contains "average"/"mean"; horizontal variant when labels are long.
- **Line** — sort by x (assumed ordinal or numeric), connect points; support a single series for v1.

All three include axes with rotated labels on overflow, a title ("Histogram of GPA"), and a tooltip on hover.

### Phase 6 — Error panel and UX polish (≈45 min)

The error panel handles four cases with specific copy:

1. Empty query → "Type a question, for example: *distribution of GPA*."
2. Unrecognized chart intent → "I couldn't tell what kind of chart you want. Try words like *distribution*, *trend*, or *compare*."
3. Field not found → "I don't see a field matching *moon phase*. Fields in this visual right now: GPA, Enrollment, …"
4. Chart/field type mismatch (e.g., histogram asked on a string column) → "*Instructor_Name* is text, so I can't draw a histogram. Try a numeric field like *GPA*."

Also add a top-right "copy example" chip row that rotates three example queries tied to the currently bound fields — this doubles as self-documentation.

### Phase 7 — Package and smoke-test (≈30 min)

- `npm run lint` clean.
- `npx pbiviz package` produces `dist/myVisual.pbiviz`.
- Manual test matrix: import the `.pbiviz` into a Power BI Desktop report built on `dummy.xlsx`, bind at least `GPA`, `Department`, `Year_Semester`, `Enrollment`, `FF_Instructors_overall_teaching_effectiveness`, and run each demo query in §1.

## 5. `capabilities.json` changes (diff sketch)

```jsonc
{
  "dataRoles": [
    { "displayName": "Category Data", "name": "category", "kind": "Grouping" },
    { "displayName": "Measure Data",  "name": "measure",  "kind": "Measure"  }
  ],
  "objects": {
    "dataPoint": { /* unchanged */ },
    "parser": {
      "properties": {
        "useLLM":   { "type": { "bool": true } },
        "apiKey":   { "type": { "text": true } }
      }
    }
  },
  "dataViewMappings": [{
    "categorical": {
      "categories": { "for": { "in": "category" }, "dataReductionAlgorithm": { "top": { "count": 10000 } } },
      "values":     { "for": { "in": "measure"  } }   // <-- was "select: [...]"
    }
  }],
  "privileges": [
    { "name": "WebAccess", "essential": false,
      "parameters": ["https://generativelanguage.googleapis.com"] }
  ]
}
```

## 6. Parser design — why rule-based first

- **Deterministic and offline.** The grader can test without network or API keys.
- **Fast.** No latency on every keystroke.
- **Explainable failures.** We can show *why* we couldn't classify, which the assignment explicitly asks for.

Gemini is a value-add fallback for long or odd phrasings. Keeping it behind a toggle means the default experience is self-contained.

## 7. Chart choices — recommend histogram, bar, line

These three cover the three common English question shapes in the brief ("distribution", "comparison", "trend"), and each maps cleanly to the dummy data:

- Histogram → `GPA`, any `Q*` rating, mean teaching-effectiveness columns.
- Bar → Enrollment by Department, response count by Instructor, mean ratings by College.
- Line → anything over `Year_Semester` (treated as ordinal).

If you want a fourth, pie would be the easiest add for "composition" queries ("share of courses by college").

## 8. Testing strategy

Two cheap layers, both optional but recommended:

- **Unit tests for `intentParser` and `fieldMatcher`** using Jest — a fixture of ~30 queries → expected intents. Runs in CI on `package.json` `test` script.
- **Visual smoke test** — a throwaway `.pbix` in the repo built on `dummy.xlsx` with the visual pre-bound to realistic fields; reviewers only need to open it and type.

## 9. Deliverables

Commit to a single repo with:

1. `myVisual/` — the updated pbiviz project.
2. `myVisual/dist/myVisual.pbiviz` — packaged visual.
3. `sample.pbix` — a Power BI report using `dummy.xlsx` with the visual pre-placed. *(Optional, but enormous quality-of-life win for the grader.)*
4. `README.md` — how to build, how to import, the supported query grammar with examples, and the Gemini toggle.
5. `PLAN.md` — this document.

## 10. Open decisions worth confirming before I start coding

| Decision | Default I would pick | Alternative |
|---|---|---|
| Parser approach | Rule-based primary + Gemini fallback behind a toggle | Rule-based only (simpler, no network) |
| Chart types | Histogram, Bar, Line | Swap Line for Pie if you care more about composition questions |
| Aggregation default for bar | Sum | Mean — useful for the rating columns in `dummy.xlsx` |
| Chart library | d3 (already in deps) | Chart.js if you want less code per chart |
| LLM model | `gemini-1.5-flash` | `gemini-1.5-pro` (slower, a bit more accurate) |

## 11. Risks and mitigations

- **Capabilities mapping rejects multi-measure binding** in older Power BI versions → fallback: keep `values.select` with three explicit slots and let the parser choose by index.
- **Sandboxed network blocks Gemini** in some tenants → the toggle plus graceful fallback keeps the visual usable.
- **Field names in the workbook are long and snake_cased** (e.g., `FF_Instructors_overall_teaching_effectiveness`) → the fuzzy matcher must tokenize on `_` and match against the semantic tail ("teaching effectiveness").
- **Ambiguous queries** (e.g., "show me sales") → default to bar if a single measure is bound; otherwise show the example-chips panel.

## 12. Time estimate

Roughly **one focused day** of work:

- Phase 0–1: 1 hour
- Phase 2: 1 hour
- Phase 3: 2 hours
- Phase 4: 1 hour (skippable)
- Phase 5: 3 hours
- Phase 6–7: 1.5 hours
- Testing & README: 1 hour

Total: **~9–10 hours** including packaging, with the LLM fallback as a stretch.

## 13. Stretch goals (if time permits)

- Query history dropdown (last 5 queries) inside the visual.
- "Explain" button next to each chart that shows the parsed intent (`chart: bar, x: Department, y: Enrollment, agg: sum`) for transparency.
- Client-side caching of Gemini responses keyed by `hash(query + fieldList)` to avoid duplicate API calls.
- Basic theming that respects the Power BI report theme colors via `host.colorPalette`.
