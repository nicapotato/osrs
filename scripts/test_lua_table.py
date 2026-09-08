#!/usr/bin/env python3
from __future__ import annotations

import unittest

from lua_table import extract_questreq_table


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


if __name__ == "__main__":
    unittest.main()
