#!/usr/bin/env python3
"""Fetch OSRS wiki skill methods and emit osrs-skills/graph.json."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from lua_table import LuaTableError, extract_return_table

WIKI_ORIGIN = "https://oldschool.runescape.wiki"
WIKI_API = f"{WIKI_ORIGIN}/api.php"
USER_AGENT = "osrs-nicapotato-skill-graph/1.0 (+https://osrs.nicapotato.com)"
LICENSE = "CC BY-NC-SA 3.0 (oldschool.runescape.wiki)"
BUCKET_PAGE_SIZE = 500

SKILL_CALC_SKILLS = [
    "Agility",
    "Construction",
    "Cooking",
    "Crafting",
    "Farming",
    "Firemaking",
    "Fishing",
    "Fletching",
    "Herblore",
    "Hunter",
    "Magic",
    "Mining",
    "Prayer",
    "Runecraft",
    "Sailing",
    "Smithing",
    "Thieving",
    "Woodcutting",
]

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

SKILL_ALIASES = {
    "Runecrafting": "Runecraft",
    "Runecraft": "Runecraft",
}

SKIP_LEVEL_UP_PREFIXES = (
    "required for",
    "required to complete",
    "new information",
    "skill mastery",
    "buy the",
    "no new abilities",
)

PLINK_RE = re.compile(r"\{\{\s*plink\s*\|([^}|]+)(?:\|[^}]*)?\}\}", re.IGNORECASE)
SCP_RE = re.compile(
    r"\{\{\s*SCP\s*\|([^}|]+)(?:\|([^}|]+))?(?:\|[^}]*)?\}\}",
    re.IGNORECASE,
)
LEVEL_PARAM_RE = re.compile(r"\|((?:freeplay|members)(?:all|\d+))\s*=")
LEVEL_NUM_RE = re.compile(r"^(?:freeplay|members)(\d+)$")


def fail(message: str) -> None:
    raise SystemExit(f"build_skill_graph: {message}")


def wiki_request(params: dict[str, str], *, timeout: float = 90.0) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{WIKI_API}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not isinstance(payload, dict):
        fail(f"wiki API returned {type(payload).__name__}")
    if "error" in payload:
        fail(f"wiki API error: {payload['error']}")
    return payload


def fetch_revision(title: str) -> str:
    payload = wiki_request(
        {
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "titles": title,
            "format": "json",
            "formatversion": "2",
        }
    )
    pages = payload.get("query", {}).get("pages", [])
    if not pages:
        fail(f"{title}: query returned no pages")
    page = pages[0]
    if page.get("missing"):
        fail(f"{title}: wiki page is missing")
    slots = page.get("revisions", [{}])[0].get("slots", {})
    text = slots.get("main", {}).get("content")
    if not isinstance(text, str) or not text.strip():
        fail(f"{title}: revision had no wikitext")
    return text


def fetch_bucket_page(offset: int, limit: int = BUCKET_PAGE_SIZE) -> list[dict[str, Any]]:
    query = (
        "bucket('recipe')"
        ".select('page_name','uses_skill','uses_material','production_json','is_members_only')"
        f".limit({limit})"
        f".offset({offset})"
        ".run()"
    )
    payload = wiki_request({"action": "bucket", "format": "json", "formatversion": "2", "query": query})
    rows = payload.get("bucket")
    if not isinstance(rows, list):
        fail(f"bucket page offset={offset} did not return a list")
    return rows


def slugify(value: str) -> str:
    text = value.strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[/'’]", "-", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def item_key(name: str) -> str:
    text = name.strip().lower()
    text = text.replace("'", "").replace("’", "")
    text = re.sub(r"\s+", " ", text)
    if not text:
        fail(f"empty item name {name!r}")
    return text


def try_canonical_skill(name: str) -> str | None:
    cleaned = name.strip()
    if not cleaned:
        return None
    aliased = SKILL_ALIASES.get(cleaned, cleaned)
    if aliased not in KNOWN_SKILLS:
        return None
    return aliased


def canonical_skill(name: str) -> str:
    aliased = try_canonical_skill(name)
    if aliased is None:
        fail(f"unknown skill {name!r}")
    return aliased


def skill_node_id(name: str) -> str:
    return f"skill:{slugify(canonical_skill(name))}"


def parse_members_flag(raw: Any, context: str) -> bool | None:
    if raw is None:
        return None
    if isinstance(raw, bool):
        return raw
    if not isinstance(raw, str):
        fail(f"{context}: members must be string or bool, got {raw!r}")
    lowered = raw.strip().lower()
    if lowered in {"yes", "true", "1"}:
        return True
    if lowered in {"no", "false", "0"}:
        return False
    fail(f"{context}: unknown members value {raw!r}")


def parse_level(raw: Any, context: str) -> int:
    if isinstance(raw, bool) or not isinstance(raw, int):
        fail(f"{context}: level must be int, got {raw!r}")
    if raw < 1 or raw > 99:
        fail(f"{context}: level {raw} out of 1-99")
    return raw


def parse_xp(raw: Any, context: str) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        fail(f"{context}: xp must be number, got {raw!r}")
    return float(raw)


def material_names(raw: Any, context: str) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, dict):
        values = [raw[key] for key in sorted(raw) if isinstance(key, int)]
        if not values:
            fail(f"{context}: materials table had no list entries")
        raw = values
    if not isinstance(raw, list):
        fail(f"{context}: materials must be a list, got {type(raw).__name__}")
    names: list[str] = []
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            fail(f"{context}: materials[{index}] must be a table")
        name = entry.get("name")
        if not isinstance(name, str) or not name.strip():
            fail(f"{context}: materials[{index}] missing name")
        names.append(name.strip())
    return names


def method_node_id(skill: str, name: str, disambiguator: str | None) -> str:
    base = f"method:{slugify(skill)}:{slugify(name)}"
    if disambiguator:
        extra = slugify(disambiguator)
        if extra and extra not in base:
            return f"{base}:{extra}"
    return base


def parse_skill_calc_entries(skill: str, lua: str) -> list[dict[str, Any]]:
    try:
        table = extract_return_table(lua)
    except LuaTableError as exc:
        fail(f"Module:Skill calc/{skill}: {exc}")
    if not isinstance(table, list) or not table:
        fail(f"Module:Skill calc/{skill}: expected non-empty list, got {type(table).__name__}")
    methods: list[dict[str, Any]] = []
    for index, raw in enumerate(table):
        if not isinstance(raw, dict):
            fail(f"Module:Skill calc/{skill}[{index}]: entry must be a table")
        name = raw.get("name")
        if not isinstance(name, str) or not name.strip():
            fail(f"Module:Skill calc/{skill}[{index}]: missing name")
        name = name.strip()
        context = f"{skill}/{name}"
        level = parse_level(raw.get("level"), context)
        xp = parse_xp(raw.get("xp"), context)
        if xp is None:
            fail(f"{context}: missing xp")
        members = parse_members_flag(raw.get("members"), context)
        method_type = raw.get("type")
        if method_type is not None and not isinstance(method_type, str):
            fail(f"{context}: type must be a string")
        subtxt = raw.get("subtxt")
        if subtxt is not None and not isinstance(subtxt, str):
            fail(f"{context}: subtxt must be a string")
        title = raw.get("title")
        if title is not None and not isinstance(title, str):
            fail(f"{context}: title must be a string")
        label_source = title.strip() if isinstance(title, str) and title.strip() else name
        label = re.sub(r"<br\s*/?>", " ", label_source, flags=re.IGNORECASE)
        label = re.sub(r"\s+", " ", label).strip()
        output_item = raw.get("outputItem")
        if output_item is not None and not isinstance(output_item, str):
            fail(f"{context}: outputItem must be a string")
        materials = material_names(raw.get("materials"), context)
        outputs = [output_item.strip()] if output_item and output_item.strip() else [name]
        methods.append(
            {
                "skill": skill,
                "name": name,
                "label": label,
                "level": level,
                "xp": xp,
                "members": members,
                "method_type": method_type.strip() if isinstance(method_type, str) else None,
                "materials": materials,
                "outputs": outputs,
                "wiki_slug": name.replace(" ", "_"),
                "source_kind": "skill_calc",
                "disambiguator": subtxt.strip() if isinstance(subtxt, str) and subtxt.strip() else None,
                "extra_skills": [],
            }
        )
    return methods


def strip_wiki_markup(text: str) -> str:
    cleaned = PLINK_RE.sub(lambda match: match.group(1).strip(), text)
    cleaned = SCP_RE.sub("", cleaned)
    cleaned = re.sub(r"\[\[[^|\]]*\|([^\]]+)\]\]", r"\1", cleaned)
    cleaned = re.sub(r"\[\[([^\]]+)\]\]", r"\1", cleaned)
    cleaned = re.sub(r"\{\{[^}]*\}\}", "", cleaned)
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    cleaned = re.sub(r"\(\s*with\s*\)", "", cleaned)
    cleaned = re.sub(r"\(\s*with\s+and\s+", "(", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\(\s+", "(", cleaned)
    cleaned = re.sub(r"\s+\)", ")", cleaned)
    return cleaned.strip(" *")


def should_skip_level_up_bullet(text: str) -> bool:
    lowered = strip_wiki_markup(text).lower()
    if not lowered:
        return True
    return any(lowered.startswith(prefix) for prefix in SKIP_LEVEL_UP_PREFIXES)


def parse_scp_skills(text: str, context: str) -> list[tuple[str, int]]:
    extra: list[tuple[str, int]] = []
    for match in SCP_RE.finditer(text):
        raw_name = match.group(1).strip()
        raw_level = (match.group(2) or "").strip()
        lowered = raw_name.lower()
        if lowered in {"quest", "diary", "miniquest"}:
            continue
        if not raw_level:
            continue
        if not raw_level.isdigit():
            continue
        skill_name = try_canonical_skill(raw_name)
        if skill_name is None:
            continue
        extra.append((skill_name, parse_level(int(raw_level), context)))
    return extra


def parse_level_up_table(skill: str, wikitext: str) -> list[dict[str, Any]]:
    marker = "{{Level up table"
    start = wikitext.find(marker)
    if start == -1:
        fail(f"{skill}/Level up table: missing Level up table template")
    body = wikitext[start + len(marker) :]
    matches = list(LEVEL_PARAM_RE.finditer(body))
    if not matches:
        fail(f"{skill}/Level up table: no freeplay/members params")
    methods: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        key = match.group(1)
        value_start = match.end()
        value_end = matches[index + 1].start() if index + 1 < len(matches) else body.find("\n}}")
        if value_end == -1:
            value_end = len(body)
        value = body[value_start:value_end]
        num_match = LEVEL_NUM_RE.match(key)
        if not num_match:
            continue
        level = parse_level(int(num_match.group(1)), f"{skill} {key}")
        members_section = key.startswith("members")
        for bullet in re.findall(r"^\*\s*(.+)$", value, flags=re.MULTILINE):
            if should_skip_level_up_bullet(bullet):
                continue
            items = [part.strip() for part in PLINK_RE.findall(bullet) if part.strip()]
            extra_skills = parse_scp_skills(bullet, f"{skill} level {level}")
            if not items and not extra_skills:
                continue
            label = strip_wiki_markup(bullet)
            if not label:
                continue
            name = items[0] if items else label
            methods.append(
                {
                    "skill": skill,
                    "name": name,
                    "label": label,
                    "level": level,
                    "xp": None,
                    "members": True if members_section else False,
                    "method_type": "Unlock",
                    "materials": [],
                    "outputs": items or [name],
                    "wiki_slug": name.replace(" ", "_"),
                    "source_kind": "level_up",
                    "disambiguator": f"lv{level}",
                    "extra_skills": extra_skills,
                }
            )
    return methods


def parse_production_json(raw: Any, context: str) -> dict[str, Any]:
    if not isinstance(raw, str) or not raw.strip():
        fail(f"{context}: production_json missing")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"{context}: production_json is not JSON ({exc})")
    if not isinstance(payload, dict):
        fail(f"{context}: production_json must be an object")
    return payload


def bucket_skill_list(raw: Any, production: dict[str, Any], context: str) -> list[tuple[str, int, float | None]]:
    skills: list[tuple[str, int, float | None]] = []
    prod_skills = production.get("skills")
    if prod_skills is None:
        prod_skills = []
    if not isinstance(prod_skills, list):
        fail(f"{context}: production_json.skills must be a list")
    for index, entry in enumerate(prod_skills):
        if not isinstance(entry, dict):
            fail(f"{context}: skills[{index}] must be an object")
        name = entry.get("name")
        if not isinstance(name, str) or not name.strip():
            fail(f"{context}: skills[{index}] missing name")
        skill_name = try_canonical_skill(name)
        if skill_name is None:
            continue
        level_raw = entry.get("level")
        if isinstance(level_raw, str) and level_raw.strip().isdigit():
            level_raw = int(level_raw.strip())
        if isinstance(level_raw, bool) or not isinstance(level_raw, int) or level_raw < 1 or level_raw > 99:
            continue
        xp_raw = entry.get("experience")
        xp: float | None
        if xp_raw in {"", None}:
            xp = None
        elif isinstance(xp_raw, str):
            try:
                xp = float(xp_raw)
            except ValueError:
                continue
        else:
            if isinstance(xp_raw, bool) or not isinstance(xp_raw, (int, float)):
                continue
            xp = float(xp_raw)
        skills.append((skill_name, level_raw, xp))
    if skills:
        return skills
    if not isinstance(raw, list):
        return []
    named = [try_canonical_skill(item) for item in raw if isinstance(item, str) and item.strip()]
    unique: list[tuple[str, int, float | None]] = []
    seen: set[str] = set()
    for name in named:
        if name is None or name in seen:
            continue
        seen.add(name)
        unique.append((name, 1, None))
    return unique


def parse_bucket_row(row: dict[str, Any], index: int) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        fail(f"bucket[{index}] must be an object")
    page_name = row.get("page_name")
    if not isinstance(page_name, str) or not page_name.strip():
        fail(f"bucket[{index}] missing page_name")
    context = f"bucket:{page_name}"
    production = parse_production_json(row.get("production_json"), context)
    skills = bucket_skill_list(row.get("uses_skill"), production, context)
    named_skills = [skill for skill, _level, _xp in skills]
    if len(set(named_skills)) < 2:
        return None
    output = production.get("output")
    output_name = page_name.strip()
    if isinstance(output, dict) and isinstance(output.get("name"), str) and output["name"].strip():
        output_name = output["name"].strip()
    materials_raw = production.get("materials")
    materials: list[str] = []
    if isinstance(materials_raw, list):
        for mat_index, entry in enumerate(materials_raw):
            if not isinstance(entry, dict):
                fail(f"{context}: materials[{mat_index}] must be an object")
            name = entry.get("name")
            if not isinstance(name, str) or not name.strip():
                fail(f"{context}: materials[{mat_index}] missing name")
            materials.append(name.strip())
    elif row.get("uses_material"):
        uses = row["uses_material"]
        if not isinstance(uses, list):
            fail(f"{context}: uses_material must be a list")
        materials = [item.strip() for item in uses if isinstance(item, str) and item.strip()]
    primary, level, xp = skills[0]
    extra = [(name, extra_level) for name, extra_level, _xp in skills[1:]]
    members = row.get("is_members_only")
    if members is not None and not isinstance(members, bool):
        fail(f"{context}: is_members_only must be bool")
    subtxt = output.get("subtxt") if isinstance(output, dict) else None
    return {
        "skill": primary,
        "name": output_name,
        "label": output_name,
        "level": level,
        "xp": xp,
        "members": members if isinstance(members, bool) else None,
        "method_type": "Recipe",
        "materials": materials,
        "outputs": [output_name],
        "wiki_slug": page_name.strip().replace(" ", "_"),
        "source_kind": "bucket",
        "disambiguator": subtxt.strip() if isinstance(subtxt, str) and subtxt.strip() else "+".join(
            slugify(name) for name, _level in extra
        ),
        "extra_skills": extra,
    }


def merge_method(existing: dict[str, Any], incoming: dict[str, Any]) -> None:
    if incoming["xp"] is not None and existing["xp"] is None:
        existing["xp"] = incoming["xp"]
    if existing["members"] is None:
        existing["members"] = incoming["members"]
    if incoming["method_type"] and existing["method_type"] == "Unlock":
        existing["method_type"] = incoming["method_type"]
        existing["label"] = incoming["label"]
    for material in incoming["materials"]:
        if material not in existing["materials"]:
            existing["materials"].append(material)
    for output in incoming["outputs"]:
        if output not in existing["outputs"]:
            existing["outputs"].append(output)
    seen = {(name, level) for name, level in existing["extra_skills"]}
    for extra in incoming["extra_skills"]:
        if extra not in seen:
            existing["extra_skills"].append(extra)
            seen.add(extra)
    kinds = existing.get("source_kinds")
    if not isinstance(kinds, list):
        kinds = [existing["source_kind"]]
        existing["source_kinds"] = kinds
    if incoming["source_kind"] not in kinds:
        kinds.append(incoming["source_kind"])


def add_skill_node(nodes: dict[str, dict[str, Any]], skill: str) -> str:
    node_id = skill_node_id(skill)
    node = {
        "id": node_id,
        "label": canonical_skill(skill),
        "category": "skill",
        "skill_key": canonical_skill(skill),
        "wiki_slug": canonical_skill(skill),
    }
    existing = nodes.get(node_id)
    if existing and existing != node:
        fail(f"duplicate skill node {node_id} with different payload")
    nodes[node_id] = node
    return node_id


def build_graph(
    calc_methods: list[dict[str, Any]],
    level_up_methods: list[dict[str, Any]],
    bucket_methods: list[dict[str, Any]],
    *,
    calc_pages: list[str],
    level_up_pages: list[str],
) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    methods: dict[str, dict[str, Any]] = {}

    for skill in SKILL_CALC_SKILLS:
        add_skill_node(nodes, skill)

    def find_existing(skill: str, raw: dict[str, Any]) -> dict[str, Any] | None:
        target_keys = {item_key(raw["name"])}
        for output in raw["outputs"]:
            target_keys.add(item_key(output))
        for method in methods.values():
            if method["skill"] != skill:
                continue
            names = {item_key(method["name"]), *(item_key(output) for output in method["outputs"])}
            if names & target_keys:
                return method
        return None

    ordered = [(method, False) for method in calc_methods + bucket_methods]
    ordered.extend((method, True) for method in level_up_methods)
    for raw, prefer_merge in ordered:
        skill = canonical_skill(raw["skill"])
        add_skill_node(nodes, skill)
        for extra_name, extra_level in raw["extra_skills"]:
            add_skill_node(nodes, extra_name)
            if extra_level < 1:
                fail(f"{raw['name']}: extra skill {extra_name} missing level")
        existing = find_existing(skill, raw) if prefer_merge else None
        node_id = existing["id"] if existing else method_node_id(skill, raw["name"], raw.get("disambiguator"))
        payload = {
            **raw,
            "id": node_id,
            "skill": skill,
        }
        if node_id in methods:
            if methods[node_id]["skill"] != skill:
                fail(f"method id collision {node_id}")
            merge_method(methods[node_id], payload)
            continue
        methods[node_id] = payload

    edges: list[dict[str, Any]] = []
    edge_ids: set[str] = set()

    def add_edge(edge: dict[str, Any]) -> None:
        if edge["id"] in edge_ids:
            fail(f"duplicate edge id {edge['id']}")
        edge_ids.add(edge["id"])
        edges.append(edge)

    producers: dict[str, list[str]] = {}
    consumers: dict[str, list[str]] = {}

    for method in methods.values():
        method_id = method["id"]
        skill_id = skill_node_id(method["skill"])
        add_edge(
            {
                "id": f"eu:{method_id}",
                "from_node_id": skill_id,
                "to_node_id": method_id,
                "relationship_type": "unlocks",
                "level": method["level"],
            }
        )
        for extra_name, extra_level in method["extra_skills"]:
            extra_id = skill_node_id(extra_name)
            if extra_id == skill_id:
                continue
            add_edge(
                {
                    "id": f"er:{extra_id}:{method_id}:{extra_level}",
                    "from_node_id": extra_id,
                    "to_node_id": method_id,
                    "relationship_type": "requires_skill",
                    "level": extra_level,
                }
            )
        seen_outputs: set[str] = set()
        for output in method["outputs"]:
            key = item_key(output)
            if key in seen_outputs:
                continue
            seen_outputs.add(key)
            producers.setdefault(key, []).append(method_id)
        seen_materials: set[str] = set()
        for material in method["materials"]:
            key = item_key(material)
            if key in seen_materials:
                continue
            seen_materials.add(key)
            consumers.setdefault(key, []).append(method_id)

    for key, producer_ids in producers.items():
        for consumer_id in consumers.get(key, []):
            for producer_id in producer_ids:
                if producer_id == consumer_id:
                    continue
                producer = methods[producer_id]
                consumer = methods[consumer_id]
                if producer["skill"] == consumer["skill"]:
                    continue
                add_edge(
                    {
                        "id": f"ef:{producer_id}:{consumer_id}:{slugify(key)[:40]}",
                        "from_node_id": producer_id,
                        "to_node_id": consumer_id,
                        "relationship_type": "feeds",
                        "item_name": key,
                    }
                )

    incoming: dict[str, list[dict[str, Any]]] = {}
    outgoing: dict[str, list[dict[str, Any]]] = {}
    for edge in edges:
        incoming.setdefault(edge["to_node_id"], []).append(edge)
        outgoing.setdefault(edge["from_node_id"], []).append(edge)

    method_nodes: list[dict[str, Any]] = []
    for method in methods.values():
        skills = {method["skill"]}
        for extra_name, _level in method["extra_skills"]:
            skills.add(extra_name)
        for edge in incoming.get(method["id"], []):
            if edge["relationship_type"] != "feeds":
                continue
            source = methods[edge["from_node_id"]]
            skills.add(source["skill"])
        for edge in outgoing.get(method["id"], []):
            if edge["relationship_type"] != "feeds":
                continue
            target = methods[edge["to_node_id"]]
            skills.add(target["skill"])
        node = {
            "id": method["id"],
            "label": method["label"],
            "category": "method",
            "primary_skill": method["skill"],
            "level": method["level"],
            "xp": method["xp"],
            "members": method["members"],
            "method_type": method["method_type"],
            "wiki_slug": method["wiki_slug"],
            "materials": method["materials"],
            "outputs": method["outputs"],
            "source_kind": method["source_kind"],
            "cross_skill_count": len(skills),
        }
        method_nodes.append(node)
        nodes[method["id"]] = node

    node_list = sorted(nodes.values(), key=lambda node: (node["category"], node.get("primary_skill") or node.get("label") or "", node["label"], node["id"]))
    return {
        "title": "OSRS Skill Method Graph",
        "source": {
            "skill_calc_pages": calc_pages,
            "level_up_pages": level_up_pages,
            "bucket": "recipe",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "license": LICENSE,
        },
        "nodes": node_list,
        "edges": edges,
    }


def validate_graph(graph: dict[str, Any]) -> None:
    if graph.get("title") != "OSRS Skill Method Graph":
        fail("graph title mismatch")
    nodes = graph.get("nodes")
    edges = graph.get("edges")
    if not isinstance(nodes, list) or not nodes:
        fail("graph.nodes must be a non-empty list")
    if not isinstance(edges, list) or not edges:
        fail("graph.edges must be a non-empty list")
    ids = [node.get("id") for node in nodes]
    if any(not isinstance(node_id, str) or not node_id for node_id in ids):
        fail("every node needs a string id")
    if len(ids) != len(set(ids)):
        fail("duplicate node ids")
    by_id = {node["id"]: node for node in nodes}
    for node in nodes:
        category = node.get("category")
        if category not in {"skill", "method"}:
            fail(f"node {node.get('id')} has unknown category {category!r}")
        if "label" not in node:
            fail(f"node {node.get('id')} missing label")
        if category == "skill" and not node.get("skill_key"):
            fail(f"skill node {node['id']} missing skill_key")
        if category == "method":
            if not node.get("primary_skill"):
                fail(f"method {node['id']} missing primary_skill")
            if not isinstance(node.get("level"), int):
                fail(f"method {node['id']} missing level")
            if not isinstance(node.get("cross_skill_count"), int):
                fail(f"method {node['id']} missing cross_skill_count")
    allowed_edges = {"unlocks", "requires_skill", "feeds"}
    saw_unlocks = False
    for edge in edges:
        rel = edge.get("relationship_type")
        if rel not in allowed_edges:
            fail(f"edge {edge.get('id')} has unknown relationship_type")
        if edge.get("from_node_id") not in by_id or edge.get("to_node_id") not in by_id:
            fail(f"edge {edge.get('id')} references missing node")
        if rel == "unlocks":
            saw_unlocks = True
            if by_id[edge["from_node_id"]]["category"] != "skill":
                fail(f"unlocks edge {edge['id']} must start at a skill")
            if by_id[edge["to_node_id"]]["category"] != "method":
                fail(f"unlocks edge {edge['id']} must end at a method")
            if not isinstance(edge.get("level"), int):
                fail(f"unlocks edge {edge['id']} missing level")
        if rel == "requires_skill" and not isinstance(edge.get("level"), int):
            fail(f"requires_skill edge {edge['id']} missing level")
        if rel == "feeds" and not edge.get("item_name"):
            fail(f"feeds edge {edge['id']} missing item_name")
    if not saw_unlocks:
        fail("graph has no unlocks edges")


def print_report(graph: dict[str, Any]) -> None:
    nodes = graph["nodes"]
    edges = graph["edges"]
    counts: dict[str, int] = {}
    for node in nodes:
        counts[node["category"]] = counts.get(node["category"], 0) + 1
    edge_counts: dict[str, int] = {}
    for edge in edges:
        edge_counts[edge["relationship_type"]] = edge_counts.get(edge["relationship_type"], 0) + 1
    cross = sum(1 for node in nodes if node["category"] == "method" and node["cross_skill_count"] >= 2)
    print(f"nodes: {len(nodes)} {counts}")
    print(f"edges: {len(edges)} {edge_counts}")
    print(f"methods with 2+ skills: {cross}")
    willow = next((node for node in nodes if node["id"] == "method:woodcutting:willow-logs"), None)
    if willow:
        print(f"willow: level {willow['level']} cross={willow['cross_skill_count']}")


def default_output_path() -> Path:
    return Path(__file__).resolve().parent.parent / "mmg-app" / "public" / "osrs-skills" / "graph.json"


def load_json_list(path: Path, label: str) -> list[Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        fail(f"{label} must be a JSON list")
    return raw


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output_path())
    parser.add_argument("--skills", nargs="+")
    parser.add_argument("--skip-bucket", action="store_true")
    parser.add_argument("--skill-calc-json", type=Path)
    parser.add_argument("--level-up-json", type=Path)
    parser.add_argument("--bucket-json", type=Path)
    args = parser.parse_args(argv)

    skill_names = args.skills or list(SKILL_CALC_SKILLS)
    unknown = [name for name in skill_names if name not in SKILL_CALC_SKILLS]
    if unknown:
        fail(f"unknown --skills {unknown}")

    calc_pages = [f"Module:Skill calc/{skill}" for skill in skill_names]
    level_up_pages = [f"{skill}/Level up table" for skill in skill_names]

    if args.skill_calc_json:
        calc_methods = load_json_list(args.skill_calc_json, "skill-calc-json")
    else:
        calc_methods = []
        for skill in skill_names:
            print(f"fetch skill calc {skill}", flush=True)
            lua = fetch_revision(f"Module:Skill calc/{skill}")
            calc_methods.extend(parse_skill_calc_entries(skill, lua))
            time.sleep(0.4)

    if args.level_up_json:
        level_up_methods = load_json_list(args.level_up_json, "level-up-json")
    else:
        level_up_methods = []
        for skill in skill_names:
            print(f"fetch level-up {skill}", flush=True)
            wikitext = fetch_revision(f"{skill}/Level up table")
            level_up_methods.extend(parse_level_up_table(skill, wikitext))
            time.sleep(0.4)

    if args.bucket_json:
        bucket_methods = load_json_list(args.bucket_json, "bucket-json")
    elif args.skip_bucket:
        bucket_methods = []
    else:
        bucket_methods = []
        offset = 0
        while True:
            print(f"fetch bucket offset={offset}", flush=True)
            rows = fetch_bucket_page(offset)
            for index, row in enumerate(rows):
                parsed = parse_bucket_row(row, offset + index)
                if parsed:
                    bucket_methods.append(parsed)
            if len(rows) < BUCKET_PAGE_SIZE:
                break
            offset += BUCKET_PAGE_SIZE
            time.sleep(0.4)

    graph = build_graph(
        calc_methods,
        level_up_methods,
        bucket_methods,
        calc_pages=calc_pages,
        level_up_pages=level_up_pages,
    )
    validate_graph(graph)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.output}")
    print_report(graph)
    return 0


if __name__ == "__main__":
    sys.exit(main())
