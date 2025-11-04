# Game import verification — 2026-09-10

Source ZIP `/Users/dev/Downloads/AntifraudBuilds.zip`: 79,856,663 bytes;
SHA256 `5177fa94cfe4f1c439e64751873e5c8f245282f29f7817a9d65f2eeb7b894aec`;
CRC verified across the archive. Only the nine WebGL files were imported, with
exact supplied bytes including CRLF HTML. All hashes match the preparation plan.
The complete current and previous file manifest is `backend/game-build-manifest.json`.
The four previous Build files remain intact. No Windows/debug payload imported.

Local runtime on port 8897: Chromium successfully initialized Unity 6000.3.14f1.
`game-menu.png` verifies `/play/`; `game-tutorial.png` verifies direct
`/play/index.html` → New Game → Shift #1 tutorial. These are real canvas captures,
not generated assets. This checks initial flow only, not a full game playthrough.

`pytest backend/tests/test_game_head.py backend/tests/test_game_embed.py
backend/tests/test_smoke.py -q`: 37 passed. HEAD validates Brotli/MIME, sizes,
new resource revalidation, old immutable cache, and HTML aliases. Exact SHA/size
verification is also run in Dockerfile before image completion.

Git LFS 3.8.0 installed and configured repository-local. Existing old `.br`
resources are ordinary Git blobs; new files follow the existing LFS attribute.
No history migration performed. Remote upload, CI materialization, server LFS,
Docker execution and production game launch still require the main delivery gate.

The strengthened browser tests exposed an outer-site defect: fixed navigation
intercepts the game Close button. Unity readiness and Escape from focused canvas
passed; Close/reopen and failed-resource dismissal await the redesign's modal
stacking fix and a repeat of this test. This is outside vendor game bytes.

Safari, mobile portrait/landscape usability, and production checks are not claimed
by this local initial-flow evidence. WebGL GPU/performance and direct-load audio
user-gesture warnings were observed without a fatal page error.

## Subsequent browser checks (fresh server 8898)

All 3 strengthened GameLauncher browser tests passed after the outer modal was
portaled to body: resources/Unity readiness, focused-canvas Escape, focus return,
iframe disposal, reopening, real Close clicks, and Close after an actual aborted
WASM request. The navigation-over-Close defect above is resolved.

Native macOS Safari 26.6.2 was operated through CUA without changing developer or
security settings. `/ru/game` opened the actual Unity menu and New Game reached
the Shift #1 tutorial; both canvas screens were visually inspected in the CUA
tool history. Fast synthesized clicks initially missed Unity input; a sustained
pointer action activated the button. Escape from focused game closed the modal.
This does not establish full game completion or saved-game compatibility.

Safari's Page Menu explicitly showed 200% zoom. RU home and RU game reflowed with
readable headings and body text; the checker was reachable by scrolling. Game
Launch remained reachable; the modal Close stayed visible and a real click
closed it and returned focus. Browser zoom was restored to 100% after testing.

Playwright WebKit 26.4 (v2287) was installed from Playwright's official browser
archive. iPhone 13 emulation (390x664 CSS viewport, DPR 3) loaded the menu,
transitioned to the tutorial, and closed successfully. Evidence:
`webkit-mobile-menu.png` and `webkit-mobile-tutorial.png`. The unchanged game's
16:9 canvas remains small in portrait with letterboxing. This is desktop WebKit
emulation, not proof on a physical iPhone, Android device, or mobile Safari.

Landscape iPhone 13 WebKit emulation also rendered the real menu with the outer
Close button fully visible (`webkit-mobile-landscape.png`). Clicking Close
removed the game dialog; only the pre-existing hidden mobile-navigation dialog
remained in DOM. The initial script's overly broad `[role=dialog]` absence check
therefore timed out on the unrelated `aria-hidden=true` navigation, not a game
close failure. No physical mobile device results are claimed.
