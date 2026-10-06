# Swordfight: what the client tells us, and what it doesn't

Source: decompiled client build 20260909165753, package `com.threerings.piracy.puzzle.sword`
(decompiled into `run/decompiled/sword-src/`), the drop-puzzle classes it builds on
(`run/decompiled/drop-src/`), `item/data/Sword` (`run/decompiled/sword-misc-src/`), the
`yohoho-puzzle-sword` media bundle for art and sound, `rsrc/en/i18n/puzzle/sword.properties`, and
YPPedia's Swordfighting pages. The practice version is `src/puzzles/swordfight/`.

## Part 1: what I couldn't get from the client (where your help is needed)

The server class `SwordManager` isn't shipped, so everything it decides is missing. I made a
choice for each of these so the puzzle plays; each one is easy to change.

1. **How fast the pair falls at the start.** The client starts at `0.01 x (difficulty + 1)`
   pixels per ms (rows are 40px), where the server sends the difficulty. Difficulty 0 is 4
   seconds a row and 9 is 400ms. I don't know which difficulty real fights use, or whether it
   depends on the opponent. **Default here: 5, which is 667ms a row.** It's a setting.
2. **How pairs are dealt.** The server sends the pieces, six pairs at a time. I don't know the
   colour odds, how often a breaker comes, or whether everyone in a fight gets the same pairs.
   **Here: each piece is one of the four colours at random, 12.5% are breakers (a setting), and
   everyone gets the same pairs in the same order.** Does that feel right to you?
3. **Attack sizes.** The server works these out. I followed YPPedia exactly: a block sends a sword
   of its own size (2x2 sends 1x4, 3x3 sends 2x4, extra width on an upright sword or extra height
   on a flat one turns into length), every two loose pieces of a break send a sprinkle, and the
   nth clear of a chain multiplies sprinkles by n and a block's longest side by n. Two things
   YPPedia leaves open:
   - whether the chain multiplier is applied before or after the 2x2 and 3x3 special cases
     (here: before, so a 2x2 in a Double is a 2x4 upright sword), and
   - what happens to a sword longer than the board (here: it's sent whole and the part that
     doesn't fit is cut off, as the client does when it draws it).
4. **When an attack is sent.** I send one attack when your board has finished settling, with
   everything from the whole chain in it. The server might send one per clear instead. Since
   the client only lands one attack per pair you place, this changes how quickly a big chain
   hurts your opponent.
5. **Strike and attack numbers.** Each sword the server sends has an id, and the client uses it
   to pick the column an upright sword starts in and which way it looks for room. I give them
   random ids, so placement looks varied, but real ids may follow a pattern.
6. **How the game's own opponents play.** Their AI is on the server. The client's settings
   object tells us a little: there's an AI skill level from 0 to 10, a "destruction percentage"
   per skill level (base 7% to 60%, maximum 10% to 70%), a 40% chance that a skill-10 AI
   chains a strike block, and AIs play more slowly once 1 to 4 players are targeting them. So
   the real AI seems to be a dice roll on how much of its board it destroys, not a player.
   **Here the training opponent plays a real board under the same rules as you**: it tries
   every spot each pair can reach, plays it out, and picks a good one; from skill 4 it also
   looks at the next pair. Skill is a preset: the Settings tab also shows each part of it (reaction
   time, mistakes, look ahead, how much it values attacking, building and keeping low, and fast
   dropping) to set on its own. Would you rather have the dice-roll style, or keep this? How did the
   real NPCs feel to fight?
7. **Who opponents attack.** With several opponents, they all attack you.
8. **Scores and ratings.** The client never scores a fight. Here the main score is damage sent
   (sprinkles plus each sword's squares), with your wins and losses per setting. Which number
   would you like to practise against?
9. **Sounds are Ogg files**, straight from the game. Safari may not play them; the other puzzles
   use MP3s. There's no converter on this PC. If you can add one (or send MP3s), I'll switch.
10. **Smaller looks.** The client shows each pirate's face and recolours the sword icons to the
    sword's colours; I show names and the plain icons. The incoming-strike sparks and the piece
    explosions are close copies, not exact.
11. **Not built yet:** Duelling (the client has it, with a second full-size board), and the
    special seas: Atlantean (aqua pieces), Haunted (purple pieces that turn to metal), sanguine
    pieces, and sea battles' rum and damage rows.

**The easiest help:** your sense of how fast pairs fell at the start and how often breakers came,
and what you want the opponent to be like.

## Part 2: things the client does tell us (maybe new to you)

### Controls
- Left and right repeat 7 times a second after a 300ms hold. **Down turns clockwise, up turns
  anticlockwise**, Space drops faster. **A / S** (or **[ / ]**) change your target.
- Every pair starts at the normal speed, even if you're still holding Space: press it again.
  Fast drop is 50ms a row. The normal speed goes up by 1/300 pixel per ms after 10 pairs, then
  13 more, 16 more and so on, up to 160ms a row.

### The pair
- Pairs appear in the fourth column, upright, with the outlined piece at the bottom. If the
  second row is taken there, the pair starts a row higher, half above the board.
- You're knocked out when the top square of the fourth column is filled as the next pair is due.
- Turning keeps the outlined piece still. If the other piece has no room, it tries one column
  right, then one left, then turns on again. Pointing down, a turn may lift the pair a row
  instead, but only twice per pair.
- Past halfway into a row, moving and turning check the row below too.
- **Landing bounces:** when the pair can't fall it stops for an eighth of a row's time (at the
  normal speed) before it settles, so you can still slide or turn it off a ledge. If it then
  lands on the same rows again, it settles at once with no second bounce.
- A piece still above the board when the pair lands is lost.

### Blocks and clears
- Same-coloured pieces fuse into the biggest rectangle at least 2x2 that contains no part of
  another block sticking out. The search starts bottom-left; a square is preferred, then tall,
  then wide.
- **A block rests on anything under any of its bottom row**, so gaps can stay under a block.
- A breaker shatters when it touches its colour (another breaker of that colour counts), taking
  every connected piece of that colour and whole blocks.
- Chains are named Double, Triple, Bingo, Donkey and Vegas (6 and up).
- The clear's check for "is this square in a block I've already counted" compares the left edge
  the wrong way round. With two separate same-coloured blocks side by side in the same rows, a
  clear that reaches the right one first still shatters the left one, but counts its squares as
  loose pieces rather than as a block. If the server uses the same code (it's in a shared
  package), the left block sends sprinkles instead of a sword. I kept it.

### Incoming attacks
- An attack is placed (with a blinking warning at the edge) when your next pair appears, and
  lands after that pair has landed and your board settles. So you always get one pair's warning.
- The warning sound tells you the size: one for sprinkles only, then danger, big and huge.
- Upright swords start at the top, in a column picked by the sword's id, and **avoid the fourth
  column unless there's nowhere else**. When they land they fall through loose pieces, crushing
  them, until something solid (a block, sword or metal) or until they'd crush more than a third
  of their own size.
- Flat swords come in from a side, at the first row (from three above your highest block) where
  they get more than halfway across. With no such row, they turn upright.
- Sprinkles are dealt one per column in turn (right to left for odd-numbered attacks), and the
  fourth column is never filled above its fourth row, so **sprinkles can't knock you out**.
- Swords and sprinkles move on a stage each time you land a pair: sword, silver, silver showing
  its colour, then the plain piece. Sprinkles start at silver.

### Swords
- Each sword type has its own pattern of colour slots, and its two colours decide which piece
  colour goes in each slot and whether the pattern is mirrored. A strike longer than the pattern
  repeats its last four rows; sprinkles use the bottom two rows. All 26 types, the stick, and
  the 8 x 8 colourings are in `strikes.ts`.

## Checked

`board.test.ts` replays cases recorded from the real client classes by
`scripts/parity/SwordParity.java` and matches every one: 36 random games settled step by step
(falling, fusing, clearing, chains), 150 attacks placed when the pair appears and again as they
land, 60 sprinkle spreads, 351 sword colourings and 300 turns and moves. `match.test.ts` checks
the YPPedia attack sizes, that a fight ends, and that the same seed and inputs always play out
the same way, which replays rely on.
