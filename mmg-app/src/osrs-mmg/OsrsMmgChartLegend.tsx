import { useEffect, useRef, useState } from "react";

export type ChartLegendItem = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
};

type Props = {
  items: ChartLegendItem[];
  hiddenKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onIsolate: (key: string) => void;
  onShowAll?: () => void;
};

const CLICK_DELAY_MS = 250;

export function useChartLegendVisibility(
  resetKey: string,
  initialHiddenKeys: readonly string[] = [],
) {
  const initialHiddenRef = useRef(initialHiddenKeys);
  initialHiddenRef.current = initialHiddenKeys;

  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(
    () => new Set(initialHiddenKeys),
  );

  useEffect(() => {
    setHiddenKeys(new Set(initialHiddenRef.current));
  }, [resetKey]);

  function toggle(key: string) {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isolate(key: string, allKeys: string[]) {
    setHiddenKeys((prev) => {
      const alreadyIsolated = allKeys.every((itemKey) =>
        itemKey === key ? !prev.has(itemKey) : prev.has(itemKey),
      );
      if (alreadyIsolated) return new Set();
      return new Set(allKeys.filter((itemKey) => itemKey !== key));
    });
  }

  function showAll() {
    setHiddenKeys(new Set());
  }

  return { hiddenKeys, toggle, isolate, showAll };
}

export function OsrsMmgChartLegend({
  items,
  hiddenKeys,
  onToggle,
  onIsolate,
  onShowAll,
}: Props) {
  const clickTimerRef = useRef<number | null>(null);
  const someHidden = items.some((item) => hiddenKeys.has(item.key));

  useEffect(() => {
    return () => {
      if (clickTimerRef.current != null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  function onItemClick(key: string) {
    if (clickTimerRef.current != null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      onIsolate(key);
      return;
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      onToggle(key);
    }, CLICK_DELAY_MS);
  }

  if (items.length === 0) return null;

  return (
    <div className="osrs-mmg__chart-legend-wrap">
      <ul className="osrs-mmg__chart-legend">
        {items.map((item) => {
          const hidden = hiddenKeys.has(item.key);
          return (
            <li key={item.key}>
              <button
                type="button"
                className={
                  hidden
                    ? "osrs-mmg__chart-legend-item is-hidden"
                    : "osrs-mmg__chart-legend-item"
                }
                title={hidden ? "Click to show" : "Click to hide · double-click to isolate"}
                onClick={() => onItemClick(item.key)}
              >
                <span
                  className={
                    item.dashed
                      ? "osrs-mmg__chart-legend-swatch is-dashed"
                      : "osrs-mmg__chart-legend-swatch"
                  }
                  style={
                    item.dashed
                      ? { borderColor: item.color }
                      : { background: item.color }
                  }
                />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
      {someHidden && onShowAll ? (
        <button type="button" className="osrs-mmg__chart-legend-reset" onClick={onShowAll}>
          Show all
        </button>
      ) : null}
    </div>
  );
}
