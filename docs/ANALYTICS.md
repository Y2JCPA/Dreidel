# Gameplay analytics
GA4: **Y2J → Jacob Bros Games**, property **561068654**, web stream **16215972677**, measurement **G-ZHTSP3LEH3**.
Reports: https://analytics.google.com/analytics/web/#/a412250833p561068654/reports/intelligenthome

Filter by `game_id`: `tehara` (The Last Jug), `tehara_classic`, or `dreidel`.
Events: `page_view`, `game_ready`, `game_start` (entry_type new/resume/chapter_select/join_in_progress/rejoin), `level_start`, `level_complete`, `first_level_complete`, `game_complete`, `active_play` (60/300/600/1200 foreground seconds with input within 60 seconds).
Tehara level events carry level_id/chapter/replay; classic completions also failure_count/hint_count. Game starts are play entries, not unique people. Classic chapters emit chapter_complete; no single full-campaign completion is inferred.
Dreidel adds referee-only `match_start`, `spin_result`, `round_complete`, `match_complete`, with play_mode, game_mode, player_count/bot_count, round_number, letter and actor_type. Participant game_start/game_complete count browser entries; use match_* for matches. Referee handoff/rejoining can cause incomplete or duplicate match totals; these are analytics, not an authoritative ledger. No names, room IDs, player IDs, save contents or answers are sent.

Suggested exploration: game_start → first_level_complete → game_complete for The Last Jug; match_start → match_complete for Dreidel. Group level_start/level_complete by level_id to identify drop-off. Compare active_play milestones separately; never interpret a page view as gameplay. Custom parameters must be registered as GA4 custom dimensions/metrics to use in standard explorations. Realtime and DebugView are quicker than processed reports (which may take 24–48 hours).

No retroactive gameplay history. Blockers, opt-outs, offline use and closing the tab can prevent delivery. Live QA visits appear in counts. Privacy and browser opt-out: ../privacy.html. URL query strings and fragments are excluded; enhanced measurement and ad signals disabled.

Verification: run `node tests/analytics.test.cjs`; local pages queue dataLayer without loading Google. Live verification must observe real /g/collect requests and response codes; do not fabricate live completion events.
