#!/usr/bin/env python3
from __future__ import annotations

import unittest

from lua_table import extract_questreq_table, extract_return_table


SAMPLE = r"""
-- comment
local questReqs = {
    ['Animal Magnetism'] = {
        ['quests'] = {
            'Ernest the Chicken',
            'Priest in Peril'
        },
        ['skills'] = {
            {'Crafting', 19},
            {'Prayer', 31, 'ironman'}
        }
    },
    ['Black Knights\' Fortress'] = {
        ['quests'] = {},
        ['skills'] = {
            {'Quest point', 12}
        }
    },
}

return questReqs
"""


class LuaTableTests(unittest.TestCase):
    def test_extracts_questreq_keys(self) -> None:
        table = extract_questreq_table(SAMPLE)
        self.assertEqual(set(table), {"Animal Magnetism", "Black Knights' Fortress"})
        animal = table["Animal Magnetism"]
        assert isinstance(animal, dict)
        self.assertEqual(animal["quests"], ["Ernest the Chicken", "Priest in Peril"])
        self.assertEqual(animal["skills"], [["Crafting", 19], ["Prayer", 31, "ironman"]])
        fortress = table["Black Knights' Fortress"]
        assert isinstance(fortress, dict)
        self.assertEqual(fortress["skills"], [["Quest point", 12]])

    def test_extracts_skill_calc_return_list(self) -> None:
        table = extract_return_table(
            """
            -- Woodcutting calculator data
            return {
                { name = 'Logs', level = 1, xp = 25, members = 'No', type = 'Regular' },
                {
                    name = 'Willow logs',
                    level = 30,
                    xp = 67.5,
                    members = 'No',
                    type = 'Regular'
                },
                {
                    name = 'Sulliuscep',
                    pic = 'Mushroom',
                    level = 65,
                    xp = 127,
                    outputItem = 'Mushroom',
                    members = 'Yes',
                    type = 'Special'
                }
            }
            """
        )
        self.assertIsInstance(table, list)
        self.assertEqual(len(table), 3)
        willow = table[1]
        assert isinstance(willow, dict)
        self.assertEqual(willow["name"], "Willow logs")
        self.assertEqual(willow["level"], 30)
        self.assertEqual(willow["xp"], 67.5)
        sull = table[2]
        assert isinstance(sull, dict)
        self.assertEqual(sull["outputItem"], "Mushroom")

    def test_evaluates_parenthesized_quantity_math(self) -> None:
        table = extract_return_table(
            """
            return {
                {
                    name = 'Mist rune',
                    level = 6,
                    xp = 8,
                    materials = {
                        { name = 'Pure essence', quantity = 1 },
                        { name = 'Binding necklace', quantity = (2/16 / 45) }
                    },
                    members = 'Yes',
                    type = 'Combination'
                }
            }
            """
        )
        self.assertIsInstance(table, list)
        mist = table[0]
        assert isinstance(mist, dict)
        materials = mist["materials"]
        assert isinstance(materials, list)
        necklace = materials[1]
        assert isinstance(necklace, dict)
        self.assertAlmostEqual(necklace["quantity"], 2 / 16 / 45)

    def test_evaluates_unparenthesized_ratio(self) -> None:
        table = extract_return_table(
            """
            return {
                { name = 'Iron bar', level = 15, xp = 12.5, materials = { { name = 'Ring of forging', quantity = 1/140 } } }
            }
            """
        )
        iron = table[0]
        assert isinstance(iron, dict)
        materials = iron["materials"]
        assert isinstance(materials, list)
        ring = materials[0]
        assert isinstance(ring, dict)
        self.assertAlmostEqual(ring["quantity"], 1 / 140)


if __name__ == "__main__":
    unittest.main()
