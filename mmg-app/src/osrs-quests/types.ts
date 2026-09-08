export const QUEST_NODE_CATEGORIES = [
  "quest",
  "miniquest",
  "diary",
  "skill",
  "quest_points",
  "kudos",
  "resource",
  "combat",
] as const;

export type QuestNodeCategory = (typeof QUEST_NODE_CATEGORIES)[number];

export const QUEST_EDGE_TYPES = ["requires_quest", "requires_skill"] as const;

export type QuestEdgeType = (typeof QUEST_EDGE_TYPES)[number];

export type QuestGraphNode = {
  id: string;
  label: string;
  category: QuestNodeCategory;
  quest_key?: string;
  wiki_slug?: string;
  difficulty?: string | null;
  length?: string | null;
  series?: string | null;
  series_index?: string | null;
  members?: boolean | null;
  quest_number?: number | null;
  skill_key?: string;
  resource_key?: string;
};

export type QuestGraphEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relationship_type: QuestEdgeType;
  started_only?: boolean;
  level?: number;
  boostable?: boolean;
  ironman_only?: boolean;
};

export type QuestGraph = {
  title: string;
  source: {
    questreq_page: string;
    quest_list_page: string;
    fetched_at: string;
    license: string;
  };
  nodes: QuestGraphNode[];
  edges: QuestGraphEdge[];
};

export type QuestPlayerStatus = "done" | "ready" | "locked" | "unknown";

export type MembersFilter = "all" | "members" | "f2p";
