#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest

from build_skill_graph import (
    build_graph,
    parse_bucket_row,
    parse_level_up_table,
    parse_skill_calc_entries,
    validate_graph,
)


WOODCUTTING_LUA = """
return {
    { name = 'Logs', level = 1, xp = 25, members = 'No', type = 'Regular' },
    { name = 'Willow logs', level = 30, xp = 67.5, members = 'No', type = 'Regular' },
}
"""

FIREMAKING_LUA = """
return {
    {
        name = 'Willow logs',
        level = 30,
        xp = 90,
        materials = { { name = 'Willow logs', quantity = 1 } },
        members = 'No',
        type = 'Regular'
    },
}
"""

LEVEL_UP = """
{{Level up table
|freeplayall =
|membersall =
|freeplay30 =
* Chop {{plink|willow logs}}
|members30 =
* Required to complete {{SCP|Diary}} [[Falador Medium Diary]]
|freeplay35 =
|members35 =
* Chop {{plink|teak logs}}
* Make {{plink|forester's ration}}s (with {{SCP|Cooking|35}})
}}
{{Skill tables}}
"""


class SkillGraphTests(unittest.TestCase):
    def test_parses_skill_calc_and_level_up(self) -> None:
        wc = parse_skill_calc_entries("Woodcutting", WOODCUTTING_LUA)
        self.assertEqual(wc[1]["name"], "Willow logs")
        self.assertEqual(wc[1]["level"], 30)
        unlocks = parse_level_up_table("Woodcutting", LEVEL_UP)
        names = {row["name"] for row in unlocks}
        self.assertIn("willow logs", names)
        self.assertIn("teak logs", names)
        self.assertIn("forester's ration", names)
        forest = next(row for row in unlocks if row["name"] == "forester's ration")
        self.assertEqual(forest["extra_skills"], [("Cooking", 35)])
        self.assertTrue(forest["members"])
        self.assertEqual(forest["label"], "Make forester's rations")
        self.assertNotIn("}}", forest["label"])

    def test_builds_feeds_and_cross_skill_count(self) -> None:
        calc = parse_skill_calc_entries("Woodcutting", WOODCUTTING_LUA)
        calc.extend(parse_skill_calc_entries("Firemaking", FIREMAKING_LUA))
        level_up = parse_level_up_table("Woodcutting", LEVEL_UP)
        graph = build_graph(
            calc,
            level_up,
            [],
            calc_pages=["Module:Skill calc/Woodcutting"],
            level_up_pages=["Woodcutting/Level up table"],
        )
        validate_graph(graph)
        by_id = {node["id"]: node for node in graph["nodes"]}
        willow = by_id["method:woodcutting:willow-logs"]
        self.assertEqual(willow["level"], 30)
        self.assertGreaterEqual(willow["cross_skill_count"], 2)
        forest = next(node for node in graph["nodes"] if "forester" in node["id"])
        self.assertEqual(forest["cross_skill_count"], 2)
        rels = {(edge["relationship_type"], edge.get("item_name")) for edge in graph["edges"]}
        self.assertIn(("feeds", "willow logs"), rels)
        self.assertTrue(any(edge["relationship_type"] == "requires_skill" for edge in graph["edges"]))

    def test_parses_multi_skill_bucket_row(self) -> None:
        production = {
            "materials": [{"quantity": "1", "name": "Crystal armour seed"}],
            "skills": [
                {"experience": "2500", "level": "70", "name": "Smithing", "boostable": "Yes"},
                {"experience": "2500", "level": "70", "name": "Crafting", "boostable": "Yes"},
            ],
            "members": True,
            "output": {"quantity": "1", "name": "Crystal helm"},
        }
        row = parse_bucket_row(
            {
                "page_name": "Crystal helm",
                "uses_skill": ["Smithing", "Crafting"],
                "uses_material": ["Crystal armour seed", "Crystal shard"],
                "is_members_only": True,
                "production_json": json.dumps(production),
            },
            0,
        )
        assert row is not None
        self.assertEqual(row["skill"], "Smithing")
        self.assertEqual(row["extra_skills"], [("Crafting", 70)])
        self.assertEqual(row["level"], 70)

    def test_skips_scp_without_numeric_level(self) -> None:
        wikitext = """
{{Level up table
|freeplay1 =
* Build {{plink|crude wooden chair}}
* Unlock {{SCP|Sailing|link=yes}}
|members1 =
}}
"""
        unlocks = parse_level_up_table("Construction", wikitext)
        names = {row["name"] for row in unlocks}
        self.assertIn("crude wooden chair", names)
        self.assertTrue(all(row["extra_skills"] == [] for row in unlocks))


if __name__ == "__main__":
    unittest.main()
