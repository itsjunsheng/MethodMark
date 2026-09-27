# MethodMark: offline question generation and admission framework

Status: architecture proposal, 11 September 2026. No backend, database, generation jobs, or AI services have been implemented by this proposal.

## Recommendation

Adapt Autodata's generate–evaluate–analyse–improve loop into an educational question authoring system with independent mathematical verification and controlled database admission. Generate complete, versioned question packages offline. Each package includes the student question, diagram specification, worked solution, acceptable answer forms, marking criteria, and verification evidence.

Autonomy should be earned for a defined question family and parameter domain. Validated families can eventually supply machine-admitted questions without a human inspecting every instance. New families, unsupported proofs, and disputed cases remain in an editorial queue. Mathematical verification, editorial approval, and empirical difficulty calibration are separate claims.

This is a proposed synthesis of current research, not a framework already demonstrated to achieve zero errors or the best performance on Singapore secondary mathematics.

## 1. What to take from the supplied Autodata paper

The supplied `Autodata.pdf` is Meta FAIR's *Autodata: An agentic data scientist to create high quality synthetic data*, arXiv:2606.25996v3, with a printed date of 7 July 2026. It is distinct from the similarly named web data collection paper.

- Section 2 and Figure 1: data creation, data analysis, recipe improvement, and an outer optimisation loop.
- Section 2.1 and Figure 2: an orchestrator, challenger, weak solver, strong solver, and verifier/judge.
- Sections 3.1–3.3: acceptance objectives depend on the downstream task. Section 3.2 shows that a larger weak–strong gap is not universally better: unsuitable all-zero weak-model results were improved by making examples more learnable.
- Section 4: analysing failure trajectories and evaluating recipe changes against validation tasks.
- Section 6, page 15: agents attempted to game evaluation, including changing the weak solver's instructions; meaningfulness and dataset-level diversity also require attention.
- Appendix C: useful structured role contracts and feedback formats, but the task-specific requirements are unsuitable to copy directly. Restrictions such as single-part questions, one-sentence answers, rejection of integer answers, or CS-specific rubric counts do not fit a secondary mathematics bank.

For MethodMark, replace the model-training objective with curriculum alignment, valid mathematics, clear communication, useful reasoning demand, fair partial-credit marking, and appropriate student difficulty. Model solve rates can diagnose problems but cannot establish a human student's proficiency or difficulty level. A good elementary exercise remains useful even when every model solves it.

The original local paper is the reference for these observations. Its experimental success rates must not be presented as a predicted quality rate for MethodMark.

## 2. Research components and their boundaries

| Component | Research basis | Adaptation |
|---|---|---|
| Iterative authoring and batch learning | Autodata | Improve generation recipes from item and batch failures; change the optimisation objective |
| Educational planning | EQPR, ACL 2025 | Specify learning objectives and reasoning requirements before writing questions |
| Executable geometry | VeriGeo, June 2026 preprint | Connect assumptions, constructions, diagrams, and proof evidence |
| Stateful execution | LangGraph | Mix agent decisions with deterministic checks, retries, and persisted job state |

EQPR uses educational planning and reflection, including search over plans. It does not remove the need to validate educational judgments against teachers. [EQPR paper](https://aclanthology.org/2025.acl-long.628/)

VeriGeo links generation to executable representations and numerical, analytical, and global consistency checks. Its research results support this direction, but do not establish complete formal verification or Singapore classroom effectiveness. [VeriGeo paper](https://arxiv.org/abs/2606.14176)

LangGraph supports stateful workflows combining deterministic and agentic steps. The framework supplies orchestration, not mathematical quality. [LangGraph documentation](https://docs.langchain.com/oss/python/langgraph/overview)

## 3. Establish the trusted foundation

Before unattended runs, prepare a reviewed, versioned curriculum registry containing school year, subject level, subject, learning objectives, prerequisite skills, allowed methods, notation conventions, and relevant syllabus references. Maintain a small set of original or appropriately sourced exemplar questions and marking policies.

Build a trusted mathematical operation library: supported expression types, explicit variable domains, equation transformations, geometric constructions, theorem rules, and answer equivalence checks. Keep the implementation and acceptance policy outside the generation agent's write permissions.

Define supported question families and their validity conditions. An approved family version specifies parameter bounds, exceptions, intended reasoning, solution derivation, rubric rules, and presentation options. Property tests sample the permitted space and probe boundary cases; symbolic reasoning or exhaustive checks are used where feasible. Sampling alone must not be described as proof of validity for all instances.

Retain a tutor-adjudicated evaluation suite of valid and intentionally defective questions. Split it by source/family, rather than randomly separating near-identical numerical variants. Reserve a final audit set that recipe optimisation cannot inspect.

## 4. Offline job contract

A scheduler creates a batch request from gaps in the usable bank, such as insufficient moderate-difficulty items for a particular skill. Counts below are examples, not recommended universal production targets.

```json
{
  "batch_id": "example-quadratics-batch",
  "curriculum_version_id": "reviewed-curriculum-version",
  "school_year": 3,
  "subject_level": "G3",
  "subject": "mathematics",
  "learning_objective_ids": ["solve-quadratics-by-factorisation"],
  "target_difficulty": "moderate",
  "target_accepted_count": 20,
  "marks_range": [3, 5],
  "allowed_methods": ["factorisation"],
  "allow_diagrams": false,
  "acceptance_policy_version": "policy-1",
  "generation_recipe_version": "recipe-1",
  "max_repairs_per_candidate": 2
}
```

The job also has an attempt limit, elapsed-time limit, token/cost budget, and concurrency cap. When those are exhausted, record a coverage shortfall. Do not relax curriculum or quality rules to reach the requested count.

## 5. Agents, tools, and ownership

| Role | Output | Boundary |
|---|---|---|
| Curriculum planner | A question blueprint tied to approved objectives | Cannot invent approved curriculum entries |
| Mathematical author | Candidate specification, answer/proof, and construction | Cannot approve its own output |
| Independent solver | Solution derived from the actual student-facing item | Does not see the author's reference answer or private derivation |
| Counterexample critic | Concrete ambiguities, missing assumptions, unintended shortcuts, or counterexamples | Must supply evidence, not just a low score |
| Assessment editor | Worked solution, rubric, alternate-method rules, and response fixtures | Must follow the fixed marking policy |
| Educational reviewer | Evidence-based judgments on clarity, alignment, demand, and presentation | Cannot override failed mathematical checks |
| Batch analyst | Failure analysis, coverage report, and proposed recipe changes | Cannot edit admission rules, audit answers, or production validators |

The orchestrator is a state machine. These roles are separate calls with restricted inputs; they need not be seven different model providers or continuously running agents. A different model family for solving/review can reduce some shared biases, but correlated errors remain possible.

Mathematical validators, rendering, duplicate detection, and database admission are deterministic services. Agents call those services; they do not certify success through their own descriptions of tool results.

## 6. The item creation loop

### A. Plan the mathematical task

Retrieve the relevant curriculum entries, approved families, exemplar rubrics, and existing coverage. Produce a blueprint naming the skill, expected reasoning steps, permitted prerequisites, mark budget, and intended variation.

Search over several candidate mathematical plans when necessary. Vary the mathematical task—unknown quantities, representation, scaffolding, or combination of concepts—rather than merely renaming people or changing numbers. Never force novelty at the expense of routine practice where routine practice is the objective.

### B. Construct a structured candidate

Use an approved family when one fits. Otherwise compose supported mathematical operations into a novel candidate. Start from a valid mathematical structure or derivation, then formulate the prompt.

The internal specification contains explicit givens, domains, units, derived quantities, goals, question parts, part dependencies, diagram constructions, answer representation, and proof steps. Separate givens from derived facts so the author cannot accidentally assume the conclusion.

For diagrams, use supported JSON operations such as circle construction, second intersection, midpoint, and tangent construction. A deterministic renderer produces SVG from the resulting geometry. Unsupported operations enter the research queue instead of being executed as arbitrary generated code.

### C. Check the mathematics and the rendered question

Run cheap schema and parameter checks first. Use exact arithmetic, symbolic equivalence, domain checks, substitution, and appropriate equation solving for supported problems. SymPy offers relevant solving facilities, but its unsupported or inconclusive results need explicit handling. [SymPy documentation](https://docs.sympy.org/latest/guides/solving/solving-guidance.html)

Verify that the complete requested answer set is correct. Do not require a unique numerical answer for tasks that legitimately have multiple roots, multiple constructions, or open responses.

For geometry, distinguish:

1. A drawable configuration satisfying the givens.
2. A general conclusion supported by those givens.
3. A school-appropriate proof of that conclusion.

A coordinate example only addresses the first claim. A proof item requires a supported theorem-rule derivation or another appropriate symbolic/formal argument that covers its assumptions and cases. Evidence must record which claim was checked. Unknown results trigger review.

Render the actual question and run layout checks for missing labels, clipping, unreadable equations, and exposed solution annotations. An independent reading of the rendered prompt can detect disagreement with the internal specification. This is an additional consistency signal, not a formal guarantee of semantic equivalence.

### D. Solve independently and search for defects

Give the independent solver exactly the information available to a student, including the diagram. Allow only the applicable tools and methods. Compare its answer and reasoning with the mathematical checks.

The critic searches for omitted domains, unintended interpretations, redundant conditions, circular proofs, wrong units, counterexamples, and answers that bypass the intended objective. A valid alternative solution should receive fair marking; if it bypasses the intended skill, revise the item design rather than declaring that solution wrong.

A solver timeout or API failure is an infrastructure outcome, not evidence that the question is bad or difficult. Agreement among models is supporting evidence, not an automatic correctness certificate.

### E. Build and test the marking package

Each rubric criterion records its mark type, maximum award, observable evidence, dependencies, permitted follow-through, and relevant alternative methods. The worked solution uses syllabus-appropriate methods even if the internal verifier uses more advanced computation.

Test the rubric against response fixtures: a correct canonical solution, a valid alternative, a correct method with a specific arithmetic error, a common misconception, unsupported answer-only work, and irrelevant working. Expected outcomes must follow reviewed family policies or be independently adjudicated; an author inventing both a response and its expected grade does not independently validate the rubric.

Use concrete mutation tests. Change a sign in the reference answer and require mathematical rejection. Remove a necessary proof assumption and require the proof check to fail or become inconclusive. Replace a valid step with a known invalid step and require the rubric test to detect it. A mutation is only a valid negative fixture when it actually changes correctness or award eligibility.

This stage evaluates the question and marking scheme. It does not certify the separate handwriting-recognition pipeline.

### F. Review educational fit and novelty

Check that each part actually exercises its stated objective; prerequisites and language fit the target cohort; scaffolding and marks are proportionate; contexts are coherent; and the intended difficulty is plausible compared with reviewed anchors.

Model-based student simulations may expose misconceptions or awkward phrasing, but their success rates are diagnostic only. Initially store difficulty as an estimate, with its rationale and source. Update empirical difficulty after enough real, tutor-approved response data is available; preserve cohort and uncertainty information.

Deduplicate exact content and inspect similarity of expression structure, diagram construction, solution/proof structure, and language. Preserve legitimate numerical variants with a common `family_id`. Limit family concentration so 500 number changes do not masquerade as 500 distinct reasoning tasks.

### G. Repair or route

Return structured failure codes and evidence: `DOMAIN_MISSING`, `ANSWER_SET_INCOMPLETE`, `PROOF_UNSUPPORTED`, `RUBRIC_INCONSISTENT`, `OBJECTIVE_MISMATCH`, or `LABEL_COLLISION`, for example.

The author repairs the candidate or chooses a new plan within the job budget. Every revision has a new content hash. Rerun checks invalidated by the change; final admission requires all receipts to match the exact final package. After the configured repair limit, reject the candidate or queue it for review. Never convert an inconclusive check into a pass.

## 7. Database admission

Store all attempts in staging for debugging and learning. Only the admission service may promote an item into the usable bank.

```text
created → checking → repair_pending → checking
                    ↘ rejected
checking → needs_review
checking → admitted       (eligible family and policy only)
needs_review → admitted   (recorded editorial decision)
admitted → suspended      (subsequent defect found)
```

Admission is a conjunction of gates, not an average quality score. Excellent writing cannot compensate for a wrong answer. Within candidates passing the gates, quality scores can help rank clarity, variety, or likely difficulty fit.

For automatic admission require an eligible family/version, a permitted parameter instance, passing mandatory mathematical and rubric checks, no unresolved critical reviewer findings, acceptable presentation, and no disallowed duplicate. New families or changed family code are not automatically eligible just because their examples pass.

An editorial decision cannot silently erase failed evidence. The defect must be corrected or the item explicitly classified under an appropriate human-reviewed verification scope, with its supporting rationale.

The commit service checks job identity, content hash, all required verification receipts, policy version, family eligibility, and idempotency. It inserts the question version, parts, rubric, diagram, and evidence atomically. A failed commit can retry without creating duplicates. The generation agent has no direct production-write capability.

Keep these dimensions separate:

| Field | Example values |
|---|---|
| `bank_status` | staging, needs_review, admitted, suspended |
| `verification_scope` | exact_instance, checked_theorem_derivation, numerical_only, human_reviewed |
| `editorial_status` | unreviewed, approved, rejected |
| `admission_mode` | machine_policy, editor |
| `calibration_status` | estimated, piloted, empirically_calibrated |

Only the retrieval view for admitted, non-suspended questions feeds paper assembly. Tutor approval before publishing a paper remains a separate application step.

## 8. Evidence saved with each question version

- School year, subject level, subject, syllabus version, objectives, prerequisites, and intended demand.
- Student-facing content, parts, givens, domains, answer set/proof goal, worked solution, and rubric version.
- Family ID/version, instantiated parameters, seed where applicable, and immutable diagram/renderer references.
- Mathematical and rubric check results, counterexample findings, independent solver outcomes, review decisions, and their scope.
- Source references, ownership, parent candidate, generation recipe, model configuration/version, validator version, timestamps, and content hash.
- Estimated difficulty and evidence; later response-derived difficulty with cohort information and uncertainty.

Store enough to explain why an item was admitted. A confidence number such as `0.97` is not a substitute for the actual checks. Preserve complete materialised outputs: seeds do not reliably reconstruct model responses across provider changes.

## 9. The outer Autodata-style improvement loop

After each batch, the analyst identifies systematic failures and underrepresented skills. It proposes changes to generation prompts, exemplar retrieval, parameter sampling, plan search, and coverage allocation.

Evaluate proposed changes against a fixed baseline on a development evaluation set and repeat runs where noise matters. Use an untouched final audit set before promotion. Repeated adaptation to a validation set can overfit it, even when the examples are called held out.

Keep quality gates, grader instructions, trusted validators, and final audit labels fixed relative to the optimiser. The optimiser can propose validator changes through a separate engineering review, but cannot install them to improve its own acceptance rate. Confirmed defects can automatically quarantine the affected family pending investigation.

Optimise useful admitted output subject to quality floors and coverage requirements. Measure cost per accepted and audited question, rather than rewarding raw production volume. Do not reward weak-model failure or high admission yield in isolation.

Human audit disagreement and student evidence feed later improvements. Every item from a revised family remains traceable to its source version, enabling suspension and regeneration when a systemic problem is discovered.

## 10. Concrete circle-geometry example

For the user's diagram, retain the givens `PQ` is a diameter, `PQ = PR`, `T` is the second intersection of `QR` with the circle, and `TS` is tangent at `T` with `S` on `PR`.

The constructor calculates dependent points rather than guessing coordinates. The instance verifier checks membership, equal lengths, tangency, and the intended ordering of points. A separate theorem derivation establishes the requested angle relationship from the stated assumptions. Student-facing drawings omit solution angle annotations.

The critic tests near-degenerate placements and checks that the proof did not assume the conclusion. The editor maps legitimate theorem applications to method marks and the conclusion to the configured accuracy criterion. Only a supported, fully checked construction/proof family can take the automatic-admission route; otherwise the package enters review.

## 11. How to establish quality before unattended scale

Start with a modest batch per supported family and two independent tutor reviews, adjudicating disagreements. Include both accepted and rejected candidates when evaluating the filter: checking only accepted examples conceals excessive rejection of good items.

Track mathematical defects escaping the gate, ambiguity, rubric errors, objective mismatch, acceptance without substantive editing, family concentration, false rejection, cost per audited accepted item, and failure modes by family. Avoid a single aggregate metric concealing weak geometry or proof performance.

As an illustration of audit uncertainty, zero defects among 300 independently sampled items implies an approximate 95% upper defect-rate bound of 1%, not proof of zero errors. Related family variants are correlated, so audit across families and batches and account for clustering. This example is a statistical illustration, not a universal sample-size recommendation or launch target.

Enable automatic admission family by family only after a predefined, tutor-agreed quality policy is met. Continue random and targeted audits; new family versions, prompt/model changes, and discovered defects trigger revalidation appropriate to their impact.

## 12. Implementation sequence

1. Define the curriculum registry, immutable question package schema, marking policy, and evaluation suite.
2. Implement a few supported algebra/statistics families with deterministic validators and response fixtures.
3. Add author, independent solver, critic, and editor calls inside a checkpointed offline workflow; record all attempts.
4. Add controlled admission and an editorial queue; validate with tutor audits.
5. Introduce geometry families with deterministic construction and explicit proof-checking scope.
6. Add batch analysis and experimentally evaluated recipe improvements.
7. Enable limited unattended admission and expand only where the measured evidence supports it.

Suggested components are Python, LangGraph for orchestration, PostgreSQL for durable records, supported symbolic tools such as SymPy, and the existing React/SVG frontend for rendering. Use an offline worker with bounded concurrency and retries. Model providers remain replaceable and should be selected by measured performance on the evaluation suite. Fine-tuning and unrestricted self-modifying agents are unnecessary for the initial implementation.

## References

- [Supplied Autodata paper](Autodata.pdf): Sections 2, 3, 4, 6, and Appendix C. Local v3 is the primary reference for this proposal's Autodata discussion.
- [Autodata research page](https://arxiv.org/abs/2606.25996).
- [EQPR, ACL 2025](https://aclanthology.org/2025.acl-long.628/).
- [VeriGeo, June 2026 preprint](https://arxiv.org/abs/2606.14176).
- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview).
- [SymPy solving guidance](https://docs.sympy.org/latest/guides/solving/solving-guidance.html).
