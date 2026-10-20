import {
  SKILL_EDGE_TYPES,
  SKILL_NODE_CATEGORIES,
  type SkillGraph,
  type SkillGraphEdge,
  type SkillGraphNode,
} from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`skill graph: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  assert(typeof value === "string", `expected string or null, got ${typeof value}`);
  return value;
}

function optionalBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  assert(typeof value === "boolean", `expected boolean or null, got ${typeof value}`);
  return value;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  assert(typeof value === "number", `expected number or null, got ${typeof value}`);
  return value;
}

function stringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((item, index) => {
    assert(typeof item === "string" && item, `${label}[${index}] must be a non-empty string`);
    return item;
  });
}

function parseNode(raw: unknown, index: number): SkillGraphNode {
  assert(isRecord(raw), `nodes[${index}] must be an object`);
  assert(typeof raw.id === "string" && raw.id, `nodes[${index}].id must be a non-empty string`);
  assert(typeof raw.label === "string" && raw.label, `node ${raw.id} missing label`);
  assert(
    typeof raw.category === "string" && (SKILL_NODE_CATEGORIES as readonly string[]).includes(raw.category),
    `node ${raw.id} has unknown category ${String(raw.category)}`,
  );
  const node: SkillGraphNode = {
    id: raw.id,
    label: raw.label,
    category: raw.category as SkillGraphNode["category"],
    skill_key: typeof raw.skill_key === "string" ? raw.skill_key : undefined,
    primary_skill: typeof raw.primary_skill === "string" ? raw.primary_skill : undefined,
    level: typeof raw.level === "number" ? raw.level : undefined,
    xp: optionalNumber(raw.xp),
    members: optionalBoolean(raw.members),
    method_type: optionalString(raw.method_type),
    wiki_slug: typeof raw.wiki_slug === "string" ? raw.wiki_slug : undefined,
    materials: stringArray(raw.materials, `node ${raw.id} materials`),
    outputs: stringArray(raw.outputs, `node ${raw.id} outputs`),
    source_kind: typeof raw.source_kind === "string" ? raw.source_kind : undefined,
    cross_skill_count: typeof raw.cross_skill_count === "number" ? raw.cross_skill_count : undefined,
  };
  if (node.category === "skill") {
    assert(Boolean(node.skill_key), `skill node ${node.id} missing skill_key`);
  }
  if (node.category === "method") {
    assert(Boolean(node.primary_skill), `method ${node.id} missing primary_skill`);
    assert(typeof node.level === "number", `method ${node.id} missing level`);
    assert(typeof node.cross_skill_count === "number", `method ${node.id} missing cross_skill_count`);
  }
  return node;
}

function parseEdge(raw: unknown, index: number): SkillGraphEdge {
  assert(isRecord(raw), `edges[${index}] must be an object`);
  assert(typeof raw.id === "string" && raw.id, `edges[${index}].id must be a non-empty string`);
  assert(typeof raw.from_node_id === "string", `edge ${raw.id} missing from_node_id`);
  assert(typeof raw.to_node_id === "string", `edge ${raw.id} missing to_node_id`);
  assert(
    typeof raw.relationship_type === "string" &&
      (SKILL_EDGE_TYPES as readonly string[]).includes(raw.relationship_type),
    `edge ${raw.id} has unknown relationship_type`,
  );
  return {
    id: raw.id,
    from_node_id: raw.from_node_id,
    to_node_id: raw.to_node_id,
    relationship_type: raw.relationship_type as SkillGraphEdge["relationship_type"],
    level: typeof raw.level === "number" ? raw.level : undefined,
    item_name: typeof raw.item_name === "string" ? raw.item_name : undefined,
  };
}

export function parseSkillGraph(raw: unknown): SkillGraph {
  assert(isRecord(raw), "graph must be an object");
  assert(raw.title === "OSRS Skill Method Graph", "unexpected graph title");
  assert(isRecord(raw.source), "graph.source must be an object");
  assert(Array.isArray(raw.source.skill_calc_pages), "source.skill_calc_pages required");
  assert(Array.isArray(raw.source.level_up_pages), "source.level_up_pages required");
  assert(typeof raw.source.bucket === "string", "source.bucket required");
  assert(typeof raw.source.fetched_at === "string", "source.fetched_at required");
  assert(typeof raw.source.license === "string", "source.license required");
  assert(Array.isArray(raw.nodes) && raw.nodes.length > 0, "graph.nodes must be a non-empty array");
  assert(Array.isArray(raw.edges) && raw.edges.length > 0, "graph.edges must be a non-empty array");

  const nodes = raw.nodes.map(parseNode);
  const edges = raw.edges.map(parseEdge);
  const ids = new Set(nodes.map((node) => node.id));
  assert(ids.size === nodes.length, "duplicate node ids");
  for (const edge of edges) {
    assert(ids.has(edge.from_node_id), `edge ${edge.id} references missing from_node_id`);
    assert(ids.has(edge.to_node_id), `edge ${edge.id} references missing to_node_id`);
  }

  return {
    title: "OSRS Skill Method Graph",
    source: {
      skill_calc_pages: raw.source.skill_calc_pages.map((page, index) => {
        assert(typeof page === "string" && page, `source.skill_calc_pages[${index}] must be a string`);
        return page;
      }),
      level_up_pages: raw.source.level_up_pages.map((page, index) => {
        assert(typeof page === "string" && page, `source.level_up_pages[${index}] must be a string`);
        return page;
      }),
      bucket: raw.source.bucket,
      fetched_at: raw.source.fetched_at,
      license: raw.source.license,
    },
    nodes,
    edges,
  };
}
