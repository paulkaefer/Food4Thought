<!--
Sync Impact Report
Version change: [unset/template] → 1.0.0 (initial ratification)
Modified principles: N/A (template placeholders → concrete principles)
Added principles:
  - I. Code Quality
  - II. Testing Standards (NON-NEGOTIABLE)
  - III. User Experience Consistency
  - IV. Performance Requirements
Added sections:
  - Domain-Specific Quality Gates (photo quality, non-food detection, confidence reporting)
  - Development Workflow
Removed sections: none (5th generic principle slot dropped per requested 4-principle scope)
Templates checked: plan-template.md, spec-template.md, tasks-template.md, checklist-template.md
  (no repo-local copies found under .specify/templates in this workspace; command/skill layer
  resolves templates dynamically, no manual edits required)
Follow-up TODOs: none
-->

# Food4Thought Constitution

## Core Principles

### I. Code Quality
All code MUST be reviewed and approved before merging; no direct commits to the
main branch. Functions and modules handling image ingestion, nutrition lookup,
and API responses MUST have single, clear responsibilities and MUST NOT mix
concerns (e.g., image preprocessing logic must stay separate from nutrition
calculation logic). Static analysis/linting MUST pass with zero errors, and
public functions and API contracts MUST be documented (inputs, outputs, error
conditions). Error handling MUST be explicit: every external call (image
storage, ML/inference service, nutrition database) MUST handle failure and
timeout cases rather than allowing unhandled exceptions to propagate to the
user. Rationale: photo-upload pipelines depend on multiple external services
and unpredictable user input; disciplined, reviewed, single-purpose code is
required to keep failures isolated and diagnosable.

### II. Testing Standards (NON-NEGOTIABLE)
Every feature MUST include automated tests before it is considered done:
unit tests for business logic, integration tests for the upload-to-result
pipeline, and contract tests for any external nutrition/ML service. Test
suites MUST include explicit edge-case coverage for: low-quality or blurry
photos, non-food items in the photo, multiple food items in a single photo,
empty/corrupted uploads, unsupported file formats, and oversized files.
A pull request MUST NOT merge if it lowers overall test coverage or leaves
a known edge case identified in this list untested. Rationale: incorrect
nutritional output carries real-world health consequences, so untested edge
cases are unacceptable risk, not mere polish.

### III. User Experience Consistency
The application MUST give users clear, consistent feedback at every stage of
the upload-to-result flow: uploading, processing, success, and failure states
MUST use consistent visual patterns, terminology, and error messaging across
the entire application. When a photo cannot be processed (poor quality,
non-food content, no recognizable food, ambiguous items), the UI MUST tell the
user specifically what went wrong and what action to take (e.g., "No food
detected — try a clearer photo of your meal") rather than a generic error.
Nutritional results MUST be presented in a consistent format (units, layout,
confidence indication) across all food types and screens. Rationale: users
trust health-related data only when the experience is predictable and
failures are explained rather than hidden or generic.

### IV. Performance Requirements
Photo uploads MUST be validated (file type, size, dimensions) client-side
before submission and server-side before processing, to fail fast on invalid
input. The end-to-end time from photo submission to nutritional result MUST
be measured and MUST target a p95 response time defined and tracked per
release; regressions beyond the agreed threshold MUST block release. Image
processing MUST be performed asynchronously with progress feedback for any
request expected to exceed 2 seconds, so the UI never appears frozen. Rationale:
users abandon slow uploads, and unbounded processing time on unvalidated
images is both a performance and availability risk.

## Domain-Specific Quality Gates
<!-- Photo/food-recognition specific constraints that apply across all principles -->

- Photo quality checks (blur, lighting, resolution) MUST run before the image
  is sent to nutrition inference, and MUST reject or flag images below a
  defined quality threshold with actionable feedback to the user.
- Non-food and ambiguous-content detection MUST be a distinct, testable step
  in the pipeline; the system MUST NOT return fabricated nutritional data for
  content it cannot confidently identify as food.
- When confidence in food identification or nutritional estimation is low,
  the response MUST clearly communicate that uncertainty to the user rather
  than presenting estimates as fact.
- All edge cases above MUST be represented as automated test fixtures (sample
  images) maintained in the test suite, not only manual QA.

## Development Workflow

Pull requests MUST link the tests covering new/changed behavior and MUST
confirm which edge cases (per Testing Standards) were validated. Code review
MUST verify compliance with Code Quality, Testing Standards, UX Consistency,
and Performance Requirements before approval. Performance-sensitive changes
(image processing, inference calls) MUST include before/after timing data in
the PR description.

## Governance

This constitution supersedes all other project practices and guidelines.
Amendments require a documented rationale, review and approval by project
maintainers, and, where applicable, a migration plan for existing code.
All PRs and reviews MUST verify compliance with this constitution; any
deviation MUST be explicitly justified in the PR description. Complexity that
is not directly justified by these principles MUST be simplified or removed.

**Version**: 1.0.0 | **Ratified**: 2026-09-16 | **Last Amended**: 2026-09-16
