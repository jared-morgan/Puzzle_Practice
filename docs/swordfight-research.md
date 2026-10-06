# Swordfight research and decisions

Research date: 6 October 2026. Target: the browser Puzzle Practice application in `work/pp-all`.
This is a feasibility and design report, not an implemented Swordfight puzzle.

## What we have

The player rules should be ported from the copied client, with the opponent implemented as a
separate model. The largest uncertainty is reproducing the production server's opponent behavior.

I inspected the original `client/app/code/yoclient-dop.jar`, rather than assuming the locally
patched jar represents production. `SwordConfig.getManagerClassName()` names
`com.threerings.piracy.puzzle.sword.server.SwordManager`. That class was not found in the
extracted client jars, local server source, or inspected vendor file inventory. This does not
prove it can never be recovered; it means the inspected materials do not contain it.

Available evidence:

- `SwordConfig.getBoardWidth()` and `getBoardHeight()` return 6 and 13.
- `SwordBoard` contains collision/drop calculations, fused-block representation, initial
  damage population, and strike/spectral-piece aging methods.
- `com.threerings.piracy.puzzle.sword.a.a` is a clear analyzer, with an existing bytecode
  listing in `run/sword-clear-analyzer.txt`.
- `com.threerings.piracy.puzzle.sword.a.i` handles strike placement/mapping. Its methods
  accept a board, a sword, and strike information. The original controller receives
  `ShaftInfo` messages and handles their strikes and sprinkle count.
- `com.threerings.puzzle.drop.client.c` and the Swordfight controller contain falling-pair
  input/timing logic. Full decoding and regression fixtures are still needed.
- `com.threerings.piracy.item.data.Sword` contains `SHAFT_PROTOTYPES`, `STICK_PROTOTYPE`,
  `TEST_PROTOTYPES`, color mapping, and shaft-piece lookup. Constants identify 26 sword
  types, 8 cosmetic sword colors, and a separate stick type. This is not proof that all
  types are currently obtainable on a live ocean.
- The full media bundle is `client/app/rsrc/bundles/media/yohoho-puzzle-sword.jar`.
  The five images in `run/sword-assets` are only an earlier partial extraction.
- A local training implementation already exists in `server/src/main/java/local/puzzlepirates/LocalWorldProvider.java`,
  with attack generation in `SwordAttackBuilder.java` and associated Java tests.
- The browser app already has puzzle registration, input bindings, settings, history,
  score-only exports, compressed replay storage, and a replay action timeline.

Official player documentation describes colored blocks and breakers, rectangular fused blocks,
chain attacks, sword-pattern mapping, and the turn-based damage-piece lifecycle. It does not
specify a production opponent algorithm. Official release notes record sword-pattern changes
and the September 2026 Dueling mode. Use the copied client's actual pattern data, rather than
assuming an older community diagram is current.

Sources:

- [Official Swordfighting documentation](https://yppedia.puzzlepirates.com/Official:Swordfighting)
- [Official release notes](https://yppedia.puzzlepirates.com/Official:Releases)

## What the existing local opponent actually does

These are properties of our local implementation, not recovered production AI settings.

| Existing control/rule | Actual behavior |
| --- | --- |
| Speed | Each AI update consumes one pair. The slider maps 0–100 to 6,000–750 ms per update. Some comments call this a piece interval; it is a pair interval. |
| Clear percentage | Probability that a generated breaker attempts a color clear. It does not measure whether the bot found a legal placement. |
| Average break percentage | Mean fraction of ordinary pieces of that color removed across the entire board, with Gaussian variation of 15 percentage points and clamping. Connectivity is not required. |
| Combo chance | Probability of arming a saved color to clear alongside a future breaker. Chains are synthesized from those color clears. |
| Saved breakers | Up to two; a small clear may be held with 85% probability, aiming at six expected pieces. Danger near the top encourages releasing them. |
| Own-piece placement | Ordinary pieces are placed independently on the shortest column; ties favor the edges. It is not a search over legal falling-pair moves. |
| Strike versus sprinkle mix | A randomly estimated fraction of a clear becomes invented fused rectangles, then attacks. Larger average clears also increase that fraction. |
| Player attacks received | Flattened to an integer attack amount, distributed as ordinary colored blocks. Actual sword geometry, incoming sword pattern, and gray-piece aging are lost on the bot's side. |
| Attack queue | At most one queued player attack lands every three AI updates. These updates consume pairs; this is not a verified production throttling rule. |
| Piece distribution | Each piece gets a uniform color and a 1-in-8 breaker roll. All participants use the same seeded stream with independent cursors. This is our server's generator. |
| Color weighting exponent | Stored and used by `chooseOpponentColor()`, but that method has no caller in the inspected file. Changing it currently does not influence the update loop. |
| Oversized strikes | Split into smaller drawable swords. The Java tests check this local policy; they do not establish equivalence with production overflow behavior. |

Reusing this model would be fast and configurable. It would need an explicit description as
an approximate NPC model. It cannot demonstrate legal combo construction or promise that a
particular sword affects it exactly as it affects a human opponent.

## Everything not established by this investigation

The first group consists of missing production facts. We can select approximations, gather
observations, or defer a feature; we should not silently call invented values authentic.

| ID | Missing fact | Consequence / decision |
| --- | --- | --- |
| U1 | Production NPC state model and decision algorithm: whether/how it uses real connectivity, simulated board states, or abstract damage. | Choose an approximate NPC model or an AI that plays a complete board under the player rules. |
| U2 | Production difficulty mapping for challenge levels, brigands, skeletons, dragoons, cultists, bosses, and mercenaries. | Use our own calibrated presets; do not label them equivalent to live levels without evidence. |
| U3 | Exact NPC clear probability, clear size distribution, breaker holding, chain probabilities, and strike/sprinkle distribution. | Expose meaningful controls and establish ranges through testing. Our existing percentages are not known live values. |
| U4 | Exact treatment of attacks received by NPCs, including sword geometry, patterns, delayed conversion, overflow, and resistance. | Choose a symmetric full-board opponent or define and document a separate NPC damage model. |
| U5 | Production NPC action cadence, reaction delay, escalation over a match, and any catch-up or adaptive behavior. | Set explicit pair speed and reaction rules; avoid hidden adaptation initially. |
| U6 | Production piece-stream generation: breaker rate, color correlations, fairness constraints, and shared versus independent participant sequences. | Keep generation seeded and configurable; 1-in-8 independent breakers is only the existing local default. |
| U7 | Production routing and timing between sending an attack and receiving it: batching, throttling, any cancellation/offset rules, and effects of targeting changes. | Decode client-side receive timing; define unresolved server scheduling explicitly. Do not assume cancellation exists. |
| U8 | Production brawl target-selection probabilities, retarget intervals, teaming effects, and monster-specific behavior. | Start with one opponent or choose a separate multi-opponent model. |
| U9 | Server tie-breaking for nearly simultaneous knockouts, disconnects, and forfeits. | Establish deterministic outcome rules after resolving pending board clears. The local two-second confirmation is a workaround, not a verified live rule. |
| U10 | Production standings/rating update formula and reliable numeric interpretation of skill labels. | Store wins/losses and raw performance metrics; avoid claiming a live-equivalent rank. |
| U11 | Whether production NPCs use information unavailable to a human: future pieces, hidden board state, or player intentions. | Limit our full-board AI to visible state and the normal preview unless an explicitly marked training option is chosen. |
| U12 | Exact special-enemy modifiers and their distributions across difficulty levels. | Defer special frays or research each enemy mode separately. Their assets alone do not establish their AI. |
| U13 | Whether this copied client's embedded sword patterns match every currently deployed live variant/test sword. | Pin the initial implementation to the copied client and identify its rules version. Official notes confirm patterns have changed before. |

The next group is recoverable client work that I have not yet fully decoded. These are
engineering tasks, not requests for the user to invent replacement rules:

- Exact repeat speed, rotation/pivot behavior, collision adjustments, hard-drop/locking,
  and preview sequence behavior in the drop controller.
- Exact rules for overlapping fused rectangles, growth, connected clearing, cascade order,
  and every chain-to-attack conversion edge case in the clear analyzer.
- Exact vertical/horizontal strike positioning, horizontal conversion, clipping/penetration,
  and oversized-attack handling on a human board.
- Exact placement and aging order for sprinkles, sword tiles, spectral pieces, and turn changes.
- Client-side top-out timing relative to pending gravity, clears, and incoming attacks.
- Exporting and checking every supported sword prototype and its color/orientation mapping.
- Cataloging full-resolution art, sounds, and special-mode effects from the complete bundle.

## Product choices we need to make

1. Training goal: practice against a human-like board-playing AI, an approximate live-NPC
   model, or both. Keep the opponent interface separate so a second model can be added later.
2. Initial scope: one-versus-one, solo building drills, multiple enemies, or team frays.
   One-versus-one plus solo drills is a manageable first release.
3. Board visibility: opponent miniature, full second board, or a toggle. Full-board AI can
   support both; an abstract NPC model should not present its preview as a legally played board.
4. Sword selection: player and opponent type/colors, default blade, and whether test/monster
   swords are included. Do not make a training opponent's sword silently meaningless.
5. Piece fairness: same sequence for both players, independent seeded sequences, and preview
   depth. Keep this separate from AI intelligence and style.
6. Difficulty presets and ranges: calibrate with playtesting rather than arbitrary percentages
   named after production skill ranks.
7. End rules: loss on top-out, dismissal as a forfeit or an unranked practice stop, and tie handling.
8. Results and graphs: win/loss, duration, attacks sent/received, blocks cleared, largest strike,
   maximum chain, pairs placed, and a per-minute attack metric. Group by rules, AI model/version,
   style, difficulty, sword patterns, and seed mode. A single total-attack score is not sufficient
   to compare wins across different opponents.
9. Practice aids: pausing, reduced speed, visible drop destination, restart same seed, incoming
   attack drills, and analysis overlays. Mark aided sessions so their statistics stay distinct.

## What “likes to fight” should mean

For a full-board AI, style changes how it evaluates legal moves; it must not manufacture attacks
or clear disconnected pieces to achieve a requested combo probability.

| Control | Concrete meaning |
| --- | --- |
| Speed | Time between pair placements, with optional bounded reaction variation. |
| Aggression | Preference for attacks now versus preserving space and clearing danger. |
| Building | Preference for larger fused rectangles instead of immediately using a breaker. |
| Combo planning | Willingness and search depth to set up a real cascade, with a fixed work budget. |
| Risk tolerance | How much height/blocked spawn risk it accepts before prioritizing survival. |
| Attack preference | Bias toward sprinkle clears or strike-building opportunities, considering the selected sword. |
| Mistakes | A controlled chance of choosing a worse legal candidate, with seeded randomness. |

Keep difficulty (decision quality and speed) independent of personality. A strong defensive AI
and a weak aggressive AI should both be possible. Test style changes statistically over many
fixed seeds; a slider name does not prove that its intended behavior changed.

## Implementation and replay approach

- Implement the player board and attack rules as a pure, deterministic engine first. Use
  original-client fixtures for board states, clears, shapes, patterns, and aging.
- Put opponents behind an interface accepting state and returning actions. The probability
  model and a board-playing model can share the match scheduler without sharing rules by accident.
- Use a fixed simulation clock and separate random streams for piece generation, AI choices,
  and cosmetic effects. Cap search work by nodes/depth, not elapsed wall time, so computer
  speed does not change the opponent's choices.
- Save both initial board states, PRNG states/seeds, swords, rules version, AI version, and
  all opponent parameters. Record compact opponent decisions or generated attack events in
  the existing replay action timeline so playback does not rerun an expensive AI search.
- Preserve old simulator/AI versions when supported or explicitly reject unsupported versions;
  do not silently replay a fight using new decisions.
- Store numeric match results separately from compressed replays, using the existing history
  and replay ID link. Put outcome and additional metrics in score-history stats. Keep aborted
  or aided runs distinguishable from completed standard fights.
- Validate dismissal, restart, navigation, simultaneous outcomes, deterministic replay and
  seeking, and score-history immutability before registering the finished puzzle in the app.

This research initially changed no runtime code. The subsequent browser implementation now reuses
the existing local TrainingBot settings; see [swordfight-draft.md](swordfight-draft.md) for what is
implemented, verified against the client, and still approximate.
