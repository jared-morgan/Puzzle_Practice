# Writes src/puzzles/vampire-carp/parity-fixture.json from the original Vampire Carp code,
# so logic.test.ts can check that the web version deals the same holes from the same seeds.
#
# Run from the original repo's src/vampirate_carp directory:
#   python3 path/to/vampire_carp_fixture.py > path/to/parity-fixture.json
import copy
import json
import os
import random
import sys

sys.path.insert(0, os.getcwd())

from HoleCreator import hole_creation, hole_creation_small, tear_hole

SEEDS = [0, 1, 7, 42, 123456789012345, 999999999999999, 31415926535]
out = {"holes": [], "tears": [], "small": []}

for seed in SEEDS:
    hole, prob, edges, next_seed = hole_creation(seed)
    out["holes"].append({"seed": seed, "grid": hole, "prob": prob, "edges": edges, "next": next_seed})
    random.seed(seed)
    torn, torn_prob, torn_edges = tear_hole(copy.deepcopy(hole), copy.deepcopy(prob))
    out["tears"].append({"seed": seed, "grid": torn, "prob": torn_prob, "edges": torn_edges})

for size in [1, 2, 3]:
    for letter in ["", "p", "x", "i"]:
        if size == 1 and letter:
            continue
        for seed in SEEDS:
            codes = ["", "", "", ""]
            for z in range(3):
                hole, prob, edges, needed, code, seed2 = hole_creation_small(size, codes, letter, seed)
                out["small"].append({
                    "size": size, "letter": letter, "seed": seed, "codes": list(codes),
                    "grid": hole, "needed": needed, "code": code, "next": seed2,
                })
                codes[z] = code
                seed = seed2

print(json.dumps(out))
