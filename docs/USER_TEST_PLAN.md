# User Test Plan

v0.1.0 is a controlled user-facing release. The goal is to verify that lawyers can understand the calculation path, reproduce a saved case, and spot missing release-blocking polish before wider distribution.

## Test Group

| Group              | Count | Purpose                                                              |
| ------------------ | ----: | -------------------------------------------------------------------- |
| User's father      |     1 | Non-developer usability check and installation friction review       |
| Practicing lawyers |     4 | Legal-practice review of terminology, output trust, and workflow fit |

Target total: 5 people.

## Test Build

- Build: GitHub draft release generated from the v0.1.0 dry-run or final tag.
- Platforms: macOS and Windows, depending on tester device.
- Scope: 판결금 이자·지연손해금 계산, 법정이율 프리셋, 결과 표, `.lcalc` 저장·로드.
- Disabled in v0.1.0: incomplete PDF/CSV/clipboard flows unless C/B explicitly complete and verify them before the final tag.

## Feedback Form

Use either a Google Form or a GitHub Issue template with the same fields:

1. Tester role: lawyer / non-lawyer / other legal professional.
2. OS and version: macOS or Windows.
3. Installation result: success / blocked / warning but proceeded.
4. Input scenario: principal, start date, end date, rate preset, options used.
5. Result confidence: could verify formula and legal-rate basis / unclear / wrong.
6. `.lcalc` flow: saved and loaded / saved only / failed.
7. Confusing labels or missing legal terms.
8. Any result that appears legally or numerically wrong.
9. Screenshot or exported file attachment when available.
10. Severity choice: release blocker / patch candidate / v0.2 improvement.

## Triage Rules

| Severity        | Criteria                                                                                | Target                                   |
| --------------- | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| Release blocker | Crash, wrong total, broken `.lcalc`, misleading legal label, missing disclaimer         | Fix before publishing v0.1.0             |
| v0.1.x patch    | Installation friction, wording ambiguity, small UI layout issue, non-critical edge case | Patch release after first feedback batch |
| v0.2 minor      | New calculator type, batch mode, PDF polish, CSV workflow, broader reporting            | Plan after v0.1.x stabilization          |

## Cycle

1. Send the draft release link and README install section to the five testers.
2. Collect feedback for 3 to 5 days.
3. Classify every item using the severity table.
4. Ship v0.1.x patches for defects that affect trust or installation.
5. Move scope expansion requests to v0.2 only after v0.1.x calculation confidence is stable.

## Exit Criteria

- At least three testers complete the form.
- At least two practicing lawyers confirm that the result table and formula labels are understandable.
- No open release blocker remains.
- Any deferred feature is disabled in the app and documented as v0.2+ work.
