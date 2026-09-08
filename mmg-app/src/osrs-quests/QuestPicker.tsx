import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { QuestGraphNode, QuestPlayerStatus } from "./types";

type Props = {
  nodes: QuestGraphNode[];
  focus: QuestGraphNode;
  statusById: Record<string, QuestPlayerStatus>;
  onSelect: (nodeId: string) => void;
};

export function QuestPicker({ nodes, focus, statusById, onSelect }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(focus.label);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) setQuery(focus.label);
  }, [focus.id, focus.label, open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || query === focus.label) return nodes;
    return nodes.filter(
      (node) =>
        node.label.toLowerCase().includes(needle) || (node.series ?? "").toLowerCase().includes(needle),
    );
  }, [focus.label, nodes, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function choose(nodeId: string) {
    onSelect(nodeId);
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className="osrs-quest__picker" ref={rootRef}>
      <input
        ref={inputRef}
        className="osrs-mmg__search-input osrs-quest__picker-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined}
        value={query}
        placeholder="Search quests"
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setQuery(focus.label);
            inputRef.current?.blur();
            return;
          }
          if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
            event.preventDefault();
            setOpen(true);
            setQuery("");
            return;
          }
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const chosen = matches[activeIndex];
            if (!chosen) return;
            choose(chosen.id);
          }
        }}
      />
      {open ? (
        <ul className="osrs-quest__picker-list" id={listId} role="listbox">
          {matches.length === 0 ? (
            <li className="osrs-quest__picker-empty">No matching quests.</li>
          ) : (
            matches.map((node, index) => (
              <li key={node.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${node.id}`}
                  role="option"
                  aria-selected={node.id === focus.id}
                  className={
                    index === activeIndex
                      ? "osrs-quest__list-btn osrs-quest__list-btn--active"
                      : "osrs-quest__list-btn"
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(node.id)}
                >
                  <span className={`osrs-quest__dot osrs-quest__dot--${statusById[node.id] ?? "unknown"}`} />
                  <span>{node.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
