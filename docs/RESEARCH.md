# Grandmaster-AI implementation research

Date: 6 November 2026. Scope: a college demonstration of adversarial chess AI, a playable Python terminal game, and an approachable 3D browser game.

## Evidence and decisions

| Area | Observed baseline | Implementation decision |
| --- | --- | --- |
| Engine | Negamax, alpha-beta, iterative deepening and handcrafted evaluator already exist. All 16 existing tests pass. | Preserve the educational algorithm; add regression coverage for checks, timeouts, terminal positions and move history. No paid AI API is necessary. |
| API | Synchronous FastAPI handlers share mutable search statistics and caches. | Isolate search instances per request, bound expensive work, validate positions and return actionable errors. |
| Storage | No database or user-account requirement in the supplied assignment. | Save/resume the current match in the browser and export PGN. Avoid collecting children's personal data or inventing cloud credentials. |
| Interface | Real Three.js pieces, wood board, themes and camera controls already exist. Beginner mode starts at depth four; analytical controls dominate. | Preserve the existing 3D world. Default to easy play, explain whose turn it is, offer hints/undo, and reveal analysis on demand. |
| Reliability | Async responses and animation callbacks can outlive a game reset. | Guard results with a game revision and board position; cancel requests on reset; reconcile rendered pieces with chess rules, including castling and en passant. |
| Accessibility | Canvas-only play and small controls. | Add keyboard move entry, visible focus, touch-sized controls, reduced motion, dialog focus handling and responsive layouts. |

## Sources

- [python-chess core documentation](https://python-chess.readthedocs.io/en/latest/core.html): legal moves, board validity, move stacks and outcome rules. A FEN does not preserve repetition history; accept a starting FEN plus moves when the client has history.
- [FastAPI concurrency documentation](https://fastapi.tiangolo.com/async/): regular `def` endpoints execute in a thread pool. Mutable engine objects must not be shared between independent searches.
- [Three.js responsive guide](https://threejs.org/manual/#en/responsive): size rendering to the display area and update camera projection when dimensions change.
- [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): minimum target sizing and spacing. This project aims for 44px primary controls.
- [Skills directory](https://skills.sh/): checked available design guidance; use relevant installed skills rather than introduce a framework migration.

## Skills and tool availability

- Impeccable: polish and accessibility guidance; UI/UX Pro Max: generated recommendations, interpreted against the existing chess design rather than adopting unrelated landing-page patterns.
- Gravitas and its Python extension: read-before-write, scoped changes, executable verification and honest completion reporting. These are engineering instructions, not a way to turn Gemini into Claude.
- Framer Motion skill inspected. This is a vanilla JavaScript/Three.js app; preserve its existing animation architecture and implement reduced-motion support without adding React.
- Graphify inspected; a repository-wide graph pipeline is disproportionate to this small codebase. Relationships are documented here: browser coordinator -> API client -> FastAPI -> search/predictor -> evaluator.
- No installed skill matching “24's depth” was identified; the existing design specification contains a 4px-based spatial scale. No Stitch tool is exposed in this chat. Existing chess Stitch design files are preserved. The referenced `stitch_ui_optimization_report.md` is for BHUVISION, a separate project.
- Webcmd 0.7.4 was found, but its fetch could not connect to its local server (socket permission denied). Official documentation was accessed with the available web tool. No remote browser fallback was used.

## Work policy and acceptance

Planning: compact; context: dependencies and callers; verification: affected behavior plus regression suite; delegation: none. Write scope: backend, frontend, tests, requirements and project documentation. Preserve existing uncommitted changes, design files and deployment scripts; do not operate Antigravity or Gemini sessions.

Acceptance: human and AI can complete legal turns; terminal game works; malformed inputs do not crash the API; simultaneous requests have independent state; deadlines preserve a legal fallback; checks are resolved in tactical search; a new game rejects stale responses; special moves render correctly; beginners see clear guidance; desktop and phone layouts remain usable; saved games can resume and export; limitations are documented.
