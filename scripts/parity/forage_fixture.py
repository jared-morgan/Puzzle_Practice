# Writes src/puzzles/forage/parity-fixture.json from the original Forage Simulator code, so
# logic.test.ts can check that the web version clears, spawns and scrambles boards the same way.
#
# Run from the original repo's Forage_Puzzle_v1 directory:
#   python3 path/to/forage_fixture.py path/to/parity-fixture.json
import random, json, sys, copy
sys.path.insert(0, '.')
from board_calc import board_calc, try_spawn_chest, check_chests
from board_turn import board_turn
from board_pool import board_pool
from board_pool_reserve import board_pool_reserve
from random_board import generate_random_board
from puzzles_randomize import puzzles_randomizer_one
from Scramble_keys import scramble_board

chest_weightings = [[0.523, 0.343, 0.134]]
def rows(b): return [''.join(r) for r in b]
out = {}
# CI session: all chests, all tools, level 4
opts = [-1, 1, -1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1, 1]
random.seed(2024)
cur, res = generate_random_board(opts)
out['ci_start'] = {'board': rows(cur), 'reserve': rows(res)}
kinds = [1, 2, 3]; w = [0.523, 0.343, 0.134]
nxt = random.choices(population=kinds, weights=w, k=1)[0]
col = random.choice([0,1,2,3,4,5,6]) if nxt == 1 else random.choice([0,1,2,3,4,5]) if nxt == 2 else random.choice([0,1,2,3,4])
msl = -1
cleared = [0,0,0]; moves = 0
rnd = random.Random(99)
clicks = [(rnd.randrange(10), rnd.randrange(7), rnd.choice([1,3])) for _ in range(1500)]
states = []
for (r, c, b) in clicks:
    cur, used = board_turn(cur, r, c, b)
    moves += used
    st = board_calc(cur, res, opts)
    cur, res = st[0], st[1]
    for i in range(3): cleared[i] += st[2][i]
    on = check_chests(cur)
    msl += 1
    if msl >= 2 and on[0] < 3:
        if (nxt == 3 and on[2] == 0 and on[3] < 1) or (nxt == 2 and on[3] == 0 and on[2] < 2) or nxt == 1:
            cur, nxt, msl, col = try_spawn_chest(cur, nxt, msl, col, kinds, w)
    if on[0] == 3: msl = -1
    states.append("".join(rows(cur)))
out['ci_clicks'] = clicks
out["ci_states"] = states[::10] + [states[-1]]
out['ci_end'] = {'reserve': rows(res), 'cleared': cleared, 'moves': moves, 'next': nxt, 'column': col, 'msl': msl}
# Puzzle fill (no scramble) and scramble
popts = [1, -1, -1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1, -1]
random.seed(77)
reserve = copy.deepcopy(board_pool_reserve("1"))
pb = puzzles_randomizer_one(copy.deepcopy(board_pool("3")))
out['puzzle3_colours'] = rows(pb)
cur = [['s']*7 for _ in range(10)]
while True:
    for y in range(10):
        for x in range(7):
            cur[y][x] = pb[y][x]
    for y in range(10):
        for x in range(7):
            if cur[y][x] == 's': cur[y][x] = random.choice(("u","v","w","x","y"))
    st = board_calc(cur, reserve, popts); cur, reserve = st[0], st[1]
    ok = True
    for y in range(10):
        for x in range(7):
            if pb[y][x] != 's':
                if cur[y][x] != pb[y][x]: ok = False
            elif cur[y][x] == 'z': ok = False
    if ok: break
out['puzzle3'] = rows(cur)
popts[13] = 1
random.seed(78)
pb = puzzles_randomizer_one(copy.deepcopy(board_pool("27")))
cur, reserve = scramble_board("27", pb, reserve, popts)
out['puzzle27_scrambled'] = rows(cur)
out['reserve_after'] = rows(reserve)
json.dump(out, open(sys.argv[1], 'w'))
print('ok', cleared, moves)
