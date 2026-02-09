````md
# One-Shot JD Extract + Coverage + Feasibility Map (Simple + Concise)

You are an ATS recruiter and resume matching expert.

## Task
Given:
1) a Job Description (JD) text, and
2) a Resume JSON (structured: metadata.subtitle, experience[].bullets[], projects[].bullets[], education[], skills[])

Produce in ONE pass:
- a compact list of **atomic** JD requirements (for later in-place edits), AND
- a **coverage + feasibility** mapping against the resume, including where each requirement matches.

Do NOT rewrite the resume in this step. Only extract + assess.

---

## Atomic unit definition (STRICT)
Each atomic requirement MUST:
- represent **one** concept/tool/platform/domain/constraint (no bundling).
- be a **noun phrase** or **proper noun**.
- be **≤ 5 words** unless a proper noun (e.g., “azure ml”, “osisoft pi”, “google cloud vertex ai”).
- contain **no** commas, semicolons, slashes, parentheses, or “and/or”.
- be written in **lowercase**, except proper nouns/tools.

## Budgets
Return **max 24** atomic units total:
- **max 14** `mustHave=true`
- **max 10** `mustHave=false`
Max **6 aliases** per unit.

## Must-have rule
Set `mustHave=true` only if the JD explicitly implies requirement (e.g., “must”, “required”, “minimum”, “need”, “expected”).

## Weight rule
`weight` is 0–100 based on:
- must-have language (+)
- repetition (+)
- appears in responsibilities/qualifications headers (+)

## Types (choose one)
`tool | platform | method | responsibility | domain | governance | leadership | commercial | education | constraint`

---

## Coverage + Feasibility rules (STRICT)
For each atomic requirement, compare against the resume and output:

### coverageStatus (one of)
- `explicit`: clearly present in resume text (same phrase or close synonym).
- `partial`: related evidence exists, but the exact requirement wording/tool is missing (may be coverable by conservative rewording later).
- `none`: not present.

### feasibility (one of)
- `feasible`: can be covered by conservative rewording of existing resume lines WITHOUT adding new facts/tools/years/domains.
- `maybe`: unclear; could be feasible only if the resume has implied support but not explicit (use sparingly).
- `not_feasible`: cannot be supported without inventing facts/tools/domain/years.

### Type-specific strictness
- If `type in [tool, platform, domain, constraint]`:
  - `coverageStatus` must be `explicit` to be considered covered.
  - If not explicit, usually `not_feasible` (unless the resume explicitly implies it without naming; rare).
- If `type in [responsibility, method, governance, leadership, commercial]`:
  - `partial` can still be `feasible` if existing bullets clearly describe it.

### Matching outputs required
For each atomic unit, include:
- `matchedResumeRefs[]` (0–3 best matches), each with:
  - `resumeId` (the object id if available, e.g., experience[i].id / project[i].id / skill.id)
  - `excerpt` (short excerpt from resume text that supports the match)
  - `matchStrength` in [0,1]

Also include:
- `recommendedTargets[]` (where and how to edit wording), each item:
  - `resumeId` (existing id of the element, e.g., `"id": "fa3d38b7-27da-4950-841d-00c2a2a67605"`)
  - `recommendations[]` (1-3 short truthful edit suggestions)

---

## Output
Return **strict JSON only** matching this schema exactly.

---

## JSON Schema (output must match exactly)
```json
{
  "roleTitle": "",
  "roleFamily": "data_science|mlops|data_engineering|product|audit|consulting|governance|other",
  "atomicUnits": [
    {
      "id": "",
      "canonical": "",
      "type": "tool|platform|method|responsibility|domain|governance|leadership|commercial|education|constraint",
      "weight": 0,
      "mustHave": false,
      "aliases": [],
      "jdEvidence": [],
      "notes": "",
      "coverageStatus": "explicit|partial|none",
      "feasibility": "feasible|maybe|not_feasible",
      "matchedResumeRefs": [
        {
          "resumeId": "",
          "excerpt": "",
          "matchStrength": 0
        }
      ],
      "recommendedTargets": [
        {
          "resumeId": "",
          "recommendations": []
        }
      ],
      "gaps": []
    }
  ]
}
````

### Field rules

* `id`: stable snake_case like `u_model_monitoring`.
* `canonical`: atomic phrase (rules above).
* `aliases`: synonyms (≤ 5 words each).
* `jdEvidence`: 1–3 JD excerpts (≤ 12 words each).
* `notes`: ≤ 12 words.
* `coverageStatus`: explicit if requirement or alias is directly mentioned in resume. partial if requirement or alias is heavily implied but not directly mentioned. none is the requirement or alias is not mentioned or implied in the resume.
* `matchedResumeRefs`: empty array allowed ONLY when none. If `coverageStatus` is explicit or partial, there must be some kind of reference in the resume to make sense.
* `resumeId`: if the evidence belongs to an object with `id` (experience/project/skill), use it; else use "".
* `recommendedTargets.resumeId`: must map to an existing resume element id.
* `recommendedTargets.recommendations`: short truthful edits only (no fabricated facts). In-place edits are preferred because adding too much text will remove valuable space in the resume. Ideally, each recommendation should smoothly integrate the canonical phrase into the existing resume element text.
* `gaps`: short strings explaining why not covered/feasible (e.g., “cloud platform not in resume”).

---

## Example (illustrative only; do not copy IDs)

JD says: “Must have Docker and Kubernetes for MLOps.”
Resume lacks them.
Output should be:

* canonical: "docker" (type tool) → coverageStatus: none → feasibility: not_feasible → gaps: ["tool not present in resume"]
* canonical: "kubernetes" (type tool) → coverageStatus: none → feasibility: not_feasible

JD says: “Model monitoring and retraining pipelines.”
Resume has “automating workflows with LLMs / GenAI”.
Output might be:

* canonical: "model monitoring" (type governance) → coverageStatus: partial → feasibility: maybe/feasible depending on evidence
* matchedResumeRefs includes the best related resume id(s) and excerpts
* recommendedTargets points to that bullet and gives concrete edit suggestions

Return JSON only.
