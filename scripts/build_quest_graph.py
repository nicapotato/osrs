#!/usr/bin/env python3
"""Fetch OSRS wiki quest requirements and emit graph.json."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from lua_table import LuaTableError, extract_questreq_table

WIKI_ORIGIN = "https://oldschool.runescape.wiki"
WIKI_API = f"{WIKI_ORIGIN}/api.php"
USER_AGENT = "osrs-nicapotato-quest-graph/1.0 (+https://osrs.nicapotato.com)"
QUESTREQ_PAGE = "Module:Questreq/data"
QUEST_LIST_PAGE = "Quests/List"

KNOWN_SKILLS = {
    "Attack",
    "Strength",
    "Defence",
    "Ranged",
    "Prayer",
    "Magic",
    "Runecraft",
    "Construction",
    "Hitpoints",
    "Agility",
    "Herblore",
    "Thieving",
    "Crafting",
    "Fletching",
    "Slayer",
    "Hunter",
    "Mining",
    "Smithing",
    "Fishing",
    "Cooking",
    "Firemaking",
    "Woodcutting",
    "Farming",
    "Sailing",
}

RESOURCE_SKILLS = {
    "Quest point": ("quest_points", "Quest points"),
    "Kudos": ("kudos", "Kudos"),
    "Combat": ("combat", "Combat"),
    "Barbarian Assault: Attacker": ("ba-attacker", "BA Attacker"),
    "Barbarian Assault: Collector": ("ba-collector", "BA Collector"),
    "Barbarian Assault: Defender": ("ba-defender", "BA Defender"),
    "Barbarian Assault: Healer": ("ba-healer", "BA Healer"),
}

ALLOWED_SKILL_FLAGS = {"boostable", "boosted", "ironman"}
ALLOWED_QUEST_PREFIXES = {"Started"}

# Questreq key -> Quests/List name when they differ.
QUEST_NAME_ALIASES = {
    "Recipe for Disaster": "Recipe for Disaster",
}

KNOWN_CHAINS = {
    "kourend": "Tale of the Righteous",
    "elf": "Song of the Elves",
    "ds2": "Dragon Slayer II",
    "mm2": "Monkey Madness II",
    "rfd": "Recipe for Disaster",
}


def fail(message: str) -> None:
    raise SystemExit(f"build_quest_graph: {message}")


def wiki_request(params: dict[str, str], *, timeout: float = 60.0) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{WIKI_API}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not isinstance(payload, dict):
        fail(f"wiki API returned {type(payload).__name__}")
    if "error" in payload:
        fail(f"wiki API error: {payload['error']}")
    return payload


def fetch_questreq_lua() -> str:
    payload = wiki_request(
        {
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "titles": QUESTREQ_PAGE,
            "format": "json",
            "formatversion": "2",
        }
    )
    pages = payload.get("query", {}).get("pages", [])
    if not pages:
        fail("questreq query returned no pages")
    slots = pages[0].get("revisions", [{}])[0].get("slots", {})
    text = slots.get("main", {}).get("content")
    if not isinstance(text, str) or not text.strip():
        fail("questreq revision had no wikitext")
    return text


def fetch_quest_list_html() -> str:
    payload = wiki_request(
        {
            "action": "parse",
            "page": QUEST_LIST_PAGE,
            "prop": "text",
            "format": "json",
            "formatversion": "2",
        }
    )
    html = payload.get("parse", {}).get("text")
    if isinstance(html, dict):
        html = html.get("*")
    if not isinstance(html, str) or not html.strip():
        fail("Quests/List parse returned no HTML")
    return html


class QuestListParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.section: str | None = None
        self.in_table = False
        self.in_thead = False
        self.in_row = False
        self.in_cell = False
        self.header_cells: list[str] = []
        self.cell_text: list[str] = []
        self.cell_href: str | None = None
        self.current_row: list[tuple[str, str | None]] = []
        self.rows: list[dict[str, Any]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag in {"h2", "h3"}:
            self.section = None
        if tag == "table" and "wikitable" in (attr.get("class") or ""):
            self.in_table = True
            self.header_cells = []
        if not self.in_table:
            return
        if tag == "tr":
            self.in_row = True
            self.current_row = []
        if tag in {"th", "td"} and self.in_row:
            self.in_cell = True
            self.cell_text = []
            self.cell_href = None
        if tag == "a" and self.in_cell and self.cell_href is None:
            href = attr.get("href")
            if href and href.startswith("/w/") and not href.startswith("/w/File:"):
                self.cell_href = href

    def handle_endtag(self, tag: str) -> None:
        if tag in {"h2", "h3"} and self.section is None:
            heading = "".join(self.cell_text).strip() if False else self.section
            del heading
        if tag == "table" and self.in_table:
            self.in_table = False
            self.in_row = False
        if not self.in_table:
            return
        if tag in {"th", "td"} and self.in_cell:
            text = re.sub(r"\s+", " ", "".join(self.cell_text)).strip()
            self.current_row.append((text, self.cell_href))
            self.in_cell = False
        if tag == "tr" and self.in_row:
            self.in_row = False
            if not self.current_row:
                return
            texts = [cell[0] for cell in self.current_row]
            if texts and texts[0] in {"#", "Name"}:
                self.header_cells = [t.lower() for t in texts]
                return
            if "name" not in self.header_cells:
                return
            row = self._row_from_cells(self.current_row)
            if row:
                self.rows.append(row)

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.cell_text.append(data)

    def _row_from_cells(self, cells: list[tuple[str, str | None]]) -> dict[str, Any] | None:
        by_header: dict[str, tuple[str, str | None]] = {}
        for header, cell in zip(self.header_cells, cells):
            by_header[header] = cell
        name_cell = by_header.get("name")
        if name_cell is None or not name_cell[0]:
            return None
        series_text = (by_header.get("series") or ("", None))[0]
        series, series_index = parse_series(series_text)
        number_text = (by_header.get("#") or ("", None))[0]
        return {
            "name": name_cell[0],
            "wiki_path": name_cell[1],
            "number": parse_quest_number(number_text),
            "difficulty": empty_to_none((by_header.get("difficulty") or ("", None))[0]),
            "length": empty_to_none((by_header.get("length") or ("", None))[0]),
            "series": series,
            "series_index": series_index,
            "members": self._members_from_section(),
            "kind": self._kind_from_section(),
        }

    def _members_from_section(self) -> bool | None:
        if not self.section:
            return None
        lower = self.section.lower()
        if "free-to-play" in lower or "free to play" in lower:
            return False
        if "members" in lower:
            return True
        return None

    def _kind_from_section(self) -> str:
        if self.section and "miniquest" in self.section.lower():
            return "miniquest"
        return "quest"


class HeadingAwareQuestListParser(QuestListParser):
    def __init__(self) -> None:
        super().__init__()
        self._heading_parts: list[str] = []
        self._in_heading = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"h2", "h3"}:
            self._in_heading = True
            self._heading_parts = []
        super().handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"h2", "h3"} and self._in_heading:
            text = re.sub(r"\s+", " ", "".join(self._heading_parts)).strip()
            text = re.sub(r"\[edit.*", "", text, flags=re.IGNORECASE).strip()
            if text:
                self.section = text
            self._in_heading = False
        super().handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        if self._in_heading:
            self._heading_parts.append(data)
        super().handle_data(data)


def empty_to_none(value: str) -> str | None:
    text = value.strip()
    if not text or text.upper() == "N/A":
        return None
    return text


def parse_quest_number(value: str) -> float | None:
    text = value.strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_series(value: str) -> tuple[str | None, str | None]:
    text = empty_to_none(value)
    if text is None:
        return None, None
    match = re.match(r"^(.*?)(?:,\s*#([0-9]+[A-Za-z]?))?$", text)
    if not match:
        return text, None
    name = match.group(1).strip()
    if name.lower() in {"n/a", ""}:
        return None, None
    name = re.sub(r"\s+quest series$", "", name, flags=re.IGNORECASE)
    return name, match.group(2)


def slugify(value: str) -> str:
    text = value.strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[/'’]", "-", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def wiki_slug_from_path(path: str | None, name: str) -> str:
    if path:
        raw = urllib.parse.unquote(path[len("/w/") :] if path.startswith("/w/") else path)
        return raw.split("#", 1)[0]
    return name.replace(" ", "_")


def normalize_name(name: str) -> str:
    text = name.strip().lower()
    text = re.sub(r"^the\s+", "", text)
    text = text.replace("'", "").replace("’", "")
    text = re.sub(r"\s+", " ", text)
    return text


def parse_quest_requirement(raw: str) -> tuple[str, bool]:
    if ":" not in raw:
        return raw, False
    prefix, rest = raw.split(":", 1)
    if prefix not in ALLOWED_QUEST_PREFIXES:
        fail(f"unknown quest requirement prefix {prefix!r} in {raw!r}")
    name = rest.strip()
    if not name:
        fail(f"empty quest name after prefix in {raw!r}")
    return name, True


def node_id_for_quest(name: str) -> str:
    return f"quest:{slugify(name)}"


def node_id_for_skill(name: str) -> str:
    return f"skill:{slugify(name)}"


def node_id_for_resource(key: str) -> str:
    resource_id, _label = RESOURCE_SKILLS[key]
    return f"resource:{resource_id}"


def kind_for_questreq_key(name: str, meta: dict[str, Any] | None) -> str:
    if meta and meta.get("kind"):
        return str(meta["kind"])
    lower = name.lower()
    if lower.endswith(" diary") or " diary" in lower:
        return "diary"
    if name.startswith("Recipe for Disaster/"):
        return "quest"
    return "quest"


def parse_list_metadata(html: str) -> dict[str, dict[str, Any]]:
    parser = HeadingAwareQuestListParser()
    parser.feed(html)
    if not parser.rows:
        fail("Quests/List HTML contained no quest rows")
    by_name: dict[str, dict[str, Any]] = {}
    for row in parser.rows:
        key = row["name"]
        if key in by_name:
            fail(f"duplicate Quests/List name {key!r}")
        by_name[key] = row
    return by_name


def lookup_metadata(name: str, by_name: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    if name in by_name:
        return by_name[name]
    alias = QUEST_NAME_ALIASES.get(name)
    if alias and alias in by_name:
        return by_name[alias]
    normalized = normalize_name(name)
    matches = [row for row in by_name.values() if normalize_name(row["name"]) == normalized]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        fail(f"ambiguous metadata match for {name!r}: {[m['name'] for m in matches]}")
    return None


def skill_tuple_from_lua(raw: Any, quest_name: str) -> tuple[str, int, bool, bool]:
    if not isinstance(raw, list) or len(raw) < 2:
        fail(f"{quest_name}: skill requirement must be {{name, level, ...}}, got {raw!r}")
    skill_name = raw[0]
    level = raw[1]
    if not isinstance(skill_name, str) or not skill_name:
        fail(f"{quest_name}: skill name must be a string, got {skill_name!r}")
    if not isinstance(level, int):
        fail(f"{quest_name}: skill level must be int, got {level!r}")
    flags = raw[2:]
    unknown = [flag for flag in flags if flag not in ALLOWED_SKILL_FLAGS]
    if unknown:
        fail(f"{quest_name}: unknown skill flags {unknown} on {skill_name}")
    if skill_name not in KNOWN_SKILLS and skill_name not in RESOURCE_SKILLS:
        fail(f"{quest_name}: unknown skill {skill_name!r}")
    return skill_name, level, "boostable" in flags or "boosted" in flags, "ironman" in flags


def build_graph(questreq: dict[str, Any], list_meta: dict[str, dict[str, Any]]) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

    def add_node(node: dict[str, Any]) -> None:
        node_id = node["id"]
        existing = nodes.get(node_id)
        if existing and existing != node:
            fail(f"duplicate node id {node_id} with different payload")
        nodes[node_id] = node

    for quest_name, payload in questreq.items():
        if not isinstance(payload, dict):
            fail(f"{quest_name}: entry must be a table")
        if "quests" not in payload or "skills" not in payload:
            fail(f"{quest_name}: missing quests/skills keys")
        meta = lookup_metadata(quest_name, list_meta)
        kind = kind_for_questreq_key(quest_name, meta)
        add_node(
            {
                "id": node_id_for_quest(quest_name),
                "label": quest_name,
                "category": kind,
                "quest_key": quest_name,
                "wiki_slug": wiki_slug_from_path(meta.get("wiki_path") if meta else None, quest_name),
                "difficulty": meta.get("difficulty") if meta else None,
                "length": meta.get("length") if meta else None,
                "series": meta.get("series") if meta else None,
                "series_index": meta.get("series_index") if meta else None,
                "members": meta.get("members") if meta else None,
                "quest_number": meta.get("number") if meta else None,
            }
        )

    keys_by_normalized = {normalize_name(name): name for name in questreq}
    if len(keys_by_normalized) != len(questreq):
        fail("Questreq keys collide after normalization")

    missing_prereqs: list[str] = []
    for quest_name, payload in questreq.items():
        target_id = node_id_for_quest(quest_name)
        raw_quests = payload.get("quests")
        if raw_quests is None:
            raw_quests = []
        if not isinstance(raw_quests, list):
            fail(f"{quest_name}: quests must be a list")
        for raw in raw_quests:
            if not isinstance(raw, str):
                fail(f"{quest_name}: quest requirement must be a string, got {raw!r}")
            prereq_name, started_only = parse_quest_requirement(raw.strip())
            prereq_name = prereq_name.strip()
            if prereq_name not in questreq:
                matched = keys_by_normalized.get(normalize_name(prereq_name))
                if matched:
                    prereq_name = matched
                else:
                    missing_prereqs.append(f"{quest_name} -> {raw}")
                    meta = lookup_metadata(prereq_name, list_meta)
                    add_node(
                        {
                            "id": node_id_for_quest(prereq_name),
                            "label": prereq_name,
                            "category": kind_for_questreq_key(prereq_name, meta),
                            "quest_key": prereq_name,
                            "wiki_slug": wiki_slug_from_path(meta.get("wiki_path") if meta else None, prereq_name),
                            "difficulty": meta.get("difficulty") if meta else None,
                            "length": meta.get("length") if meta else None,
                            "series": meta.get("series") if meta else None,
                            "series_index": meta.get("series_index") if meta else None,
                            "members": meta.get("members") if meta else None,
                            "quest_number": meta.get("number") if meta else None,
                        }
                    )
            edges.append(
                {
                    "id": f"eq:{slugify(prereq_name)}:{slugify(quest_name)}:{'started' if started_only else 'done'}",
                    "from_node_id": node_id_for_quest(prereq_name),
                    "to_node_id": target_id,
                    "relationship_type": "requires_quest",
                    "started_only": started_only,
                }
            )

        raw_skills = payload.get("skills")
        if raw_skills is None:
            raw_skills = []
        if not isinstance(raw_skills, list):
            fail(f"{quest_name}: skills must be a list")
        for raw in raw_skills:
            skill_name, level, boostable, ironman_only = skill_tuple_from_lua(raw, quest_name)
            if skill_name in KNOWN_SKILLS:
                source_id = node_id_for_skill(skill_name)
                add_node({"id": source_id, "label": skill_name, "category": "skill", "skill_key": skill_name})
            else:
                source_id = node_id_for_resource(skill_name)
                _resource_id, label = RESOURCE_SKILLS[skill_name]
                if skill_name == "Quest point":
                    category = "quest_points"
                elif skill_name == "Kudos":
                    category = "kudos"
                elif skill_name == "Combat":
                    category = "combat"
                else:
                    category = "resource"
                add_node(
                    {
                        "id": source_id,
                        "label": label,
                        "category": category,
                        "resource_key": skill_name,
                    }
                )
            edges.append(
                {
                    "id": f"es:{slugify(skill_name)}:{slugify(quest_name)}:{level}",
                    "from_node_id": source_id,
                    "to_node_id": target_id,
                    "relationship_type": "requires_skill",
                    "level": level,
                    "boostable": boostable,
                    "ironman_only": ironman_only,
                }
            )

    if missing_prereqs:
        preview = "; ".join(missing_prereqs)
        print(f"warning: {len(missing_prereqs)} prereqs were not Questreq keys and were added as leaves: {preview}")

    edge_ids = [edge["id"] for edge in edges]
    if len(edge_ids) != len(set(edge_ids)):
        fail("duplicate edge ids")

    node_list = sorted(nodes.values(), key=lambda node: (node["category"], node["label"]))
    return {
        "title": "OSRS Quest Dependency Graph",
        "source": {
            "questreq_page": QUESTREQ_PAGE,
            "quest_list_page": QUEST_LIST_PAGE,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "license": "CC BY-NC-SA 3.0 (oldschool.runescape.wiki)",
        },
        "nodes": node_list,
        "edges": edges,
    }


def validate_graph(graph: dict[str, Any]) -> None:
    if graph.get("title") != "OSRS Quest Dependency Graph":
        fail("graph title mismatch")
    nodes = graph.get("nodes")
    edges = graph.get("edges")
    if not isinstance(nodes, list) or not nodes:
        fail("graph.nodes must be a non-empty list")
    if not isinstance(edges, list):
        fail("graph.edges must be a list")
    ids = [node.get("id") for node in nodes]
    if any(not isinstance(node_id, str) or not node_id for node_id in ids):
        fail("every node needs a string id")
    if len(ids) != len(set(ids)):
        fail("duplicate node ids")
    by_id = {node["id"]: node for node in nodes}
    allowed_categories = {
        "quest",
        "miniquest",
        "diary",
        "skill",
        "quest_points",
        "kudos",
        "resource",
        "combat",
    }
    for node in nodes:
        category = node.get("category")
        if category not in allowed_categories:
            fail(f"node {node.get('id')} has unknown category {category!r}")
        if "label" not in node:
            fail(f"node {node.get('id')} missing label")
    allowed_edges = {"requires_quest", "requires_skill"}
    for edge in edges:
        if edge.get("relationship_type") not in allowed_edges:
            fail(f"edge {edge.get('id')} has unknown relationship_type")
        if edge.get("from_node_id") not in by_id or edge.get("to_node_id") not in by_id:
            fail(f"edge {edge.get('id')} references missing node")


def ancestor_chain(graph: dict[str, Any], quest_name: str) -> list[str]:
    by_label = {node["label"]: node for node in graph["nodes"] if node["category"] in {"quest", "miniquest", "diary"}}
    if quest_name not in by_label:
        fail(f"known chain quest missing: {quest_name}")
    target = by_label[quest_name]["id"]
    incoming: dict[str, list[str]] = {}
    labels = {node["id"]: node["label"] for node in graph["nodes"]}
    for edge in graph["edges"]:
        if edge["relationship_type"] != "requires_quest":
            continue
        incoming.setdefault(edge["to_node_id"], []).append(edge["from_node_id"])
    seen: set[str] = set()
    order: list[str] = []

    def walk(node_id: str) -> None:
        if node_id in seen:
            return
        seen.add(node_id)
        for parent in incoming.get(node_id, []):
            walk(parent)
        order.append(labels[node_id])

    walk(target)
    return order


def print_report(graph: dict[str, Any], questreq: dict[str, Any]) -> None:
    nodes = graph["nodes"]
    edges = graph["edges"]
    counts: dict[str, int] = {}
    for node in nodes:
        counts[node["category"]] = counts.get(node["category"], 0) + 1
    started = sum(1 for edge in edges if edge.get("started_only"))
    ironman = sum(1 for edge in edges if edge.get("ironman_only"))
    rfd = [name for name in questreq if name.startswith("Recipe for Disaster")]
    print(f"nodes: {len(nodes)} {counts}")
    print(f"edges: {len(edges)} (started_only={started}, ironman_only={ironman})")
    print(f"rfd keys: {len(rfd)}")
    for key, quest_name in KNOWN_CHAINS.items():
        chain = ancestor_chain(graph, quest_name)
        print(f"{key}: {' -> '.join(chain)}")


def default_output_path() -> Path:
    return Path(__file__).resolve().parent.parent / "mmg-app" / "public" / "osrs-quests" / "graph.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output_path())
    parser.add_argument("--questreq-lua", type=Path)
    parser.add_argument("--quest-list-html", type=Path)
    args = parser.parse_args(argv)

    if args.questreq_lua:
        lua = args.questreq_lua.read_text(encoding="utf-8")
    else:
        lua = fetch_questreq_lua()
        time.sleep(1)
    try:
        questreq = extract_questreq_table(lua)
    except LuaTableError as exc:
        fail(str(exc))
    if args.quest_list_html:
        html = args.quest_list_html.read_text(encoding="utf-8")
    else:
        html = fetch_quest_list_html()
    list_meta = parse_list_metadata(html)
    graph = build_graph(questreq, list_meta)
    validate_graph(graph)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.output}")
    print_report(graph, questreq)
    return 0


if __name__ == "__main__":
    sys.exit(main())
