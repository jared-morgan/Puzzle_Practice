# Swordfight browser draft

Open `#/swordfight` on the practice website. The Vite development server updates this puzzle when its
source changes; the normal site build also includes it automatically.

## Included

- A 6×13 player board with paired drops, rotation, hard drop, connected breaker clears,
  rectangular blocks, rigid block gravity, cascades and grey damage aging.
- Fight mode with 1–10 TrainingBots, visible opponent boards and selectable attack targets.
- Solo building practice, pause, fixed seeds and retrying the same seed.
- The existing cloned server settings: speed, breaker clear chance, combo chance, average colour
  broken, enemy count, sword and randomised opponent colours. Defaults match the local server.
- Stick, Cutlass, Long Sword, Stiletto, Katana, Trunk, Falchion, Cleaver and Foil patterns,
  including the client's colour permutations, mirroring and row wrapping.
- Numeric score records separate from compressed replay files. `score` is attack blocks sent;
  records also retain result, duration, blocks cleared, pairs, received damage, best chain,
  opponents defeated, seed, mode and whether pausing was used. Replay IDs link the two.
- Deterministic replays record player input and settings; the opponent simulation is reconstructed
  from the seed. Playback and seeking do not add score records. Dismissing or navigating away
  finishes the session, including when paused.

Default keys: left/right arrows move, up/down arrows rotate, Space drops, A/S change target,
Escape pauses. Bindings are configurable and saved in each replay.

## Sources and verification

The original `yoclient-dop.jar` supplies sword prototypes, pattern lookup, Java random dealing,
sprites and sounds. `client-fixtures.json` contains 200 dealt pieces and 54 pattern cases generated
by running the original Java classes. Tests compare the TypeScript implementation with those
outputs, including pattern wrapping beyond the original height.

`LocalWorldProvider.java` and `SwordAttackBuilder.java` in the local server supply TrainingBot
behaviour, settings, timing and attack shaping. TrainingBots use the server's approximate colour
clearing and independent piece placement, rather than searching legal moves on a second player
board. The four AI sliders retain that meaning; no new difficulty model is introduced here.

The [official Swordfighting help](https://yppedia.puzzlepirates.com/Official:Swordfighting) supplies
the connected clear, rectangular block, combo and damage-aging rules. Further research and source
locations are in [swordfight-research.md](swordfight-research.md).

## Draft limits and iteration decisions

Incoming strikes currently land above the stack. The original client has more complex strike
placement, crushing and horizontal entry rules; this part needs further parity work. Overlapping
rectangles use a stable maximal-rectangle approximation rather than the client's exact join order.
The player's drop timing is a draft schedule, since its starting speed is supplied by the missing
production server. These limits are also shown in the Settings tab.

The first draft deliberately reuses the agreed local TrainingBot model. Decisions still needed
are whether a later opponent should make legal moves, how the player's drop speed should progress,
and which measure should lead future rankings (attack count, attack rate, wins or survival time).
All relevant raw totals are retained so graphs can be added without decoding replay payloads.

Replay simulator and rules versions begin at 1. Changes affecting deterministic playback must bump
the simulator version; this prelaunch build does not promise compatibility with experimental tapes.
