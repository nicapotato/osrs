import { useCallback, useEffect, useState } from "react";
import { select, zoom, zoomIdentity } from "d3";

import type { QuestGraphEdge } from "./types";

export type QuestMenuAnchor = {
  nodeId: string;
  x: number;
  y: number;
};

export function edgeTouchesNode(edge: QuestGraphEdge, nodeId: string): boolean {
  return edge.from_node_id === nodeId || edge.to_node_id === nodeId;
}

export function neighborIdsFor(edges: QuestGraphEdge[], nodeId: string): Set<string> {
  const ids = new Set<string>([nodeId]);
  for (const edge of edges) {
    if (edge.from_node_id === nodeId) ids.add(edge.to_node_id);
    if (edge.to_node_id === nodeId) ids.add(edge.from_node_id);
  }
  return ids;
}

export function useQuestGraphSelection(onFocus: (nodeId: string) => void) {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [menu, setMenu] = useState<QuestMenuAnchor | null>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  const clear = useCallback(() => {
    setMenu(null);
    setHighlightId(null);
  }, []);

  const onNodeClick = useCallback((nodeId: string) => {
    setHighlightId(nodeId);
    setMenu(null);
  }, []);

  const onNodeMenu = useCallback((nodeId: string, point: { clientX: number; clientY: number }) => {
    setHighlightId(nodeId);
    setMenu({ nodeId, x: point.clientX, y: point.clientY });
  }, []);

  const onNodeFocus = useCallback(
    (nodeId: string) => {
      setMenu(null);
      onFocus(nodeId);
    },
    [onFocus],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") clear();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear]);

  return {
    highlightId,
    menu,
    closeMenu,
    clear,
    onNodeClick,
    onNodeMenu,
    onNodeFocus,
  };
}

export function attachQuestGraphZoom(
  svg: SVGSVGElement,
  scaleExtent: [number, number],
  resetIdentity: boolean,
): () => void {
  const selection = select(svg);
  const zoomLayer = selection.select<SVGGElement>("g.osrs-quest__zoom");
  if (zoomLayer.empty()) {
    throw new Error("quest graph: missing zoom layer");
  }
  const behavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent(scaleExtent)
    .filter((event) => {
      if (event.type === "dblclick") return false;
      if (event.type === "wheel") return true;
      const target = event.target as Element | null;
      if (target?.closest?.(".osrs-quest__node")) return false;
      return (!event.ctrlKey || event.type === "wheel") && event.button === 0;
    })
    .on("zoom", (event) => {
      zoomLayer.attr("transform", event.transform.toString());
    });
  selection.call(behavior);
  selection.on("dblclick.zoom", null);
  if (resetIdentity) {
    selection.call(behavior.transform, zoomIdentity);
  }
  return () => {
    selection.on(".zoom", null);
  };
}
