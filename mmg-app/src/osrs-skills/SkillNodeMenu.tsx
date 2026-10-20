import { useEffect, useLayoutEffect, useRef } from "react";

import { wikiUrl } from "./graphIndex";
import type { SkillGraphNode } from "./types";

type Props = {
  node: SkillGraphNode;
  x: number;
  y: number;
  onFocus: () => void;
  onClose: () => void;
};

const MENU_WIDTH = 220;

export function SkillNodeMenu({ node, x, y, onFocus, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    const left = Math.min(Math.max(pad, x), window.innerWidth - rect.width - pad);
    const top = Math.min(Math.max(pad, y), window.innerHeight - rect.height - pad);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="osrs-quest__menu"
      role="menu"
      aria-label={`${node.label} actions`}
      style={{ left: x, top: y, width: MENU_WIDTH }}
    >
      <p className="osrs-quest__menu-title">{node.label}</p>
      <button type="button" role="menuitem" onClick={onFocus}>
        Open timeline
      </button>
      <a role="menuitem" href={wikiUrl(node)} target="_blank" rel="noreferrer" onClick={onClose}>
        Open wiki
      </a>
    </div>
  );
}
