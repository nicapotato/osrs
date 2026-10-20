export const SKILL_NODE_CATEGORIES = ["skill", "method"] as const;

export type SkillNodeCategory = (typeof SKILL_NODE_CATEGORIES)[number];

export const SKILL_EDGE_TYPES = ["unlocks", "requires_skill", "feeds"] as const;

export type SkillEdgeType = (typeof SKILL_EDGE_TYPES)[number];

export type SkillGraphNode = {
  id: string;
  label: string;
  category: SkillNodeCategory;
  skill_key?: string;
  primary_skill?: string;
  level?: number;
  xp?: number | null;
  members?: boolean | null;
  method_type?: string | null;
  wiki_slug?: string;
  materials?: string[];
  outputs?: string[];
  source_kind?: string;
  cross_skill_count?: number;
};

export type SkillGraphEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relationship_type: SkillEdgeType;
  level?: number;
  item_name?: string;
};

export type SkillGraph = {
  title: "OSRS Skill Method Graph";
  source: {
    skill_calc_pages: string[];
    level_up_pages: string[];
    bucket: string;
    fetched_at: string;
    license: string;
  };
  nodes: SkillGraphNode[];
  edges: SkillGraphEdge[];
};

export type SkillPlayerStatus = "ready" | "locked" | "unknown";

export type MembersFilter = "all" | "members" | "f2p";

export type CrossSkillFilter = 1 | 2 | 3;

export type SkillNetworkView = "force" | "chord" | "sankey";
