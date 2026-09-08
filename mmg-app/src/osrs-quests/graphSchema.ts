import {
  QUEST_EDGE_TYPES,
  QUEST_NODE_CATEGORIES,
  type QuestGraph,
  type QuestGraphEdge,
  type QuestGraphNode,
} from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`quest graph: ${message}`);
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

function parseNode(raw: unknown, index: number): QuestGraphNode {
  assert(isRecord(raw), `nodes[${index}] must be an object`);
  assert(typeof raw.id === "string" && raw.id, `nodes[${index}].id must be a non-empty string`);
  assert(typeof raw.label === "string" && raw.label, `node ${raw.id} missing label`);
  assert(
    typeof raw.category === "string" && (QUEST_NODE_CATEGORIES as readonly string[]).includes(raw.category),
    `node ${raw.id} has unknown category ${String(raw.category)}`,
  );
  return {
    id: raw.id,
    label: raw.label,
    category: raw.category as QuestGraphNode["category"],
    quest_key: typeof raw.quest_key === "string" ? raw.quest_key : undefined,
    wiki_slug: typeof raw.wiki_slug === "string" ? raw.wiki_slug : undefined,
    difficulty: optionalString(raw.difficulty),
    length: optionalString(raw.length),
    series: optionalString(raw.series),
    series_index: optionalString(raw.series_index),
    members: optionalBoolean(raw.members),
    quest_number: typeof raw.quest_number === "number" ? raw.quest_number : null,
    skill_key: typeof raw.skill_key === "string" ? raw.skill_key : undefined,
    resource_key: typeof raw.resource_key === "string" ? raw.resource_key : undefined,
  };
}

function parseEdge(raw: unknown, index: number): QuestGraphEdge {
  assert(isRecord(raw), `edges[${index}] must be an object`);
  assert(typeof raw.id === "string" && raw.id, `edges[${index}].id must be a non-empty string`);
  assert(typeof raw.from_node_id === "string", `edge ${raw.id} missing from_node_id`);
  assert(typeof raw.to_node_id === "string", `edge ${raw.id} missing to_node_id`);
  assert(
    typeof raw.relationship_type === "string" &&
      (QUEST_EDGE_TYPES as readonly string[]).includes(raw.relationship_type),
    `edge ${raw.id} has unknown relationship_type`,
  );
  return {
    id: raw.id,
    from_node_id: raw.from_node_id,
    to_node_id: raw.to_node_id,
    relationship_type: raw.relationship_type as QuestGraphEdge["relationship_type"],
    started_only: raw.started_only === true,
    level: typeof raw.level === "number" ? raw.level : undefined,
    boostable: raw.boostable === true,
    ironman_only: raw.ironman_only === true,
  };
}

export function parseQuestGraph(raw: unknown): QuestGraph {
  assert(isRecord(raw), "graph must be an object");
  assert(raw.title === "OSRS Quest Dependency Graph", "unexpected graph title");
  assert(isRecord(raw.source), "graph.source must be an object");
  assert(typeof raw.source.questreq_page === "string", "source.questreq_page required");
  assert(typeof raw.source.quest_list_page === "string", "source.quest_list_page required");
  assert(typeof raw.source.fetched_at === "string", "source.fetched_at required");
  assert(typeof raw.source.license === "string", "source.license required");
  assert(Array.isArray(raw.nodes) && raw.nodes.length > 0, "graph.nodes must be a non-empty array");
  assert(Array.isArray(raw.edges), "graph.edges must be an array");

  const nodes = raw.nodes.map(parseNode);
  const edges = raw.edges.map(parseEdge);
  const ids = new Set(nodes.map((node) => node.id));
  assert(ids.size === nodes.length, "duplicate node ids");
  for (const edge of edges) {
    assert(ids.has(edge.from_node_id), `edge ${edge.id} references missing from_node_id`);
    assert(ids.has(edge.to_node_id), `edge ${edge.id} references missing to_node_id`);
  }

  return {
    title: raw.title,
    source: {
      questreq_page: raw.source.questreq_page,
      quest_list_page: raw.source.quest_list_page,
      fetched_at: raw.source.fetched_at,
      license: raw.source.license,
    },
    nodes,
    edges,
  };
}
