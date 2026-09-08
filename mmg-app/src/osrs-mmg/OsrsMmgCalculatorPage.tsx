import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { isLiveDataEnabled } from "./dataConfig";
import { fetchGuide } from "./duckdbQueries";
import { getUserKph, setUserKph } from "./kphPreferences";
import { calcAtKph, formatGp, formatMargin, formatQty, formatShare, formatUnitCost, marginTone } from "./mmgCalc";
import { OsrsMmgDataBanner } from "./OsrsMmgDataBanner";
import { OsrsMmgItemBreakdownPanel } from "./OsrsMmgItemBreakdownPanel";
import { OsrsMmgSkillIcons } from "./OsrsMmgSkillIcons";
import { OsrsMmgTrendsPanel } from "./OsrsMmgTrendsPanel";
import { SAMPLE_GUIDES } from "./sampleGuides";
import type { MmgGuide } from "./types";
import { useOsrsData } from "./useOsrsData";
import { formatWikiPlainText, splitWikiMetrics } from "./wikiText";

function LineTable({
  title,
  lines,
  sideTotal,
}: {
  title: string;
  lines: ReturnType<typeof calcAtKph>["inputs"];
  sideTotal: number;
}) {
  return (
    <section className="osrs-mmg__panel osrs-mmg__panel--lines">
      <h3>{title}</h3>
      <table className="osrs-mmg__table">
        <thead>
          <tr>
            <th>Qty/h</th>
            <th>Item</th>
            <th>Unit cost</th>
            <th>GP/h</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.wikiSlug}>
              <td>{formatQty(line.qtyPerHour)} ×</td>
              <td>{line.itemName}</td>
              <td>{formatUnitCost(line)}</td>
              <td>{formatGp(line.gpPerHour)}</td>
              <td>{formatShare(line.gpPerHour, sideTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function OsrsMmgCalculatorPage() {
  const { methodId } = useParams<{ methodId: string }>();
  const data = useOsrsData();
  const [guide, setGuide] = useState<MmgGuide | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!methodId) return;
    if (!isLiveDataEnabled()) {
      const sample = SAMPLE_GUIDES.find((g) => g.id === methodId) ?? SAMPLE_GUIDES[0] ?? null;
      setGuide(sample);
      return;
    }
    if (!data.ready) return;
    void fetchGuide(methodId)
      .then((loaded) => {
        if (!loaded) throw new Error("Guide not found in dataset");
        setGuide(loaded);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [methodId, data.ready]);

  const activeGuide = guide;
  const [kph, setKph] = useState(1);

  useEffect(() => {
    if (!activeGuide) return;
    setKph(getUserKph(activeGuide.id, activeGuide.defaultKph));
  }, [activeGuide]);

  const result = useMemo(
    () => (activeGuide ? calcAtKph(activeGuide, kph) : null),
    [activeGuide, kph],
  );

  function onKphChange(next: number) {
    if (!activeGuide || !Number.isFinite(next) || next < 0) return;
    setKph(next);
    setUserKph(activeGuide.id, next);
  }

  function onResetKph() {
    if (!activeGuide) return;
    setKph(activeGuide.defaultKph);
    setUserKph(activeGuide.id, activeGuide.defaultKph);
  }

  if (isLiveDataEnabled() && data.loading) {
    return (
      <div className="osrs-mmg">
        <OsrsMmgDataBanner
          loading={data.loading}
          error={data.error}
          manifest={data.manifest}
          fromCache={data.fromCache}
          loadPhase={data.loadPhase}
          downloadProgress={data.downloadProgress}
          onReload={data.reload}
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="osrs-mmg">
        <p className="osrs-mmg__banner osrs-mmg__banner--error">{loadError}</p>
        <Link to="/mmg">Back to rankings</Link>
      </div>
    );
  }

  if (!activeGuide || !result) {
    return <div className="osrs-mmg"><p>Loading guide…</p></div>;
  }

  return (
    <div className="osrs-mmg osrs-mmg--calculator">
      <header className="osrs-mmg__header">
        <div className="osrs-mmg__header-row">
          <h1>{formatWikiPlainText(activeGuide.methodName)}</h1>
          <nav className="osrs-mmg__header-nav" aria-label="Page links">
            <Link to="/mmg">← Rankings</Link>
            <Link to="/quests">Quests</Link>
            <a href="/">Home</a>
          </nav>
        </div>
        <p>Adjust completions per hour using the same math as the OSRS Wiki mmgkc gadget.</p>
      </header>

      {isLiveDataEnabled() ? (
        <OsrsMmgDataBanner
          loading={data.loading}
          error={data.error}
          manifest={data.manifest}
          fromCache={data.fromCache}
          loadPhase={data.loadPhase}
          downloadProgress={data.downloadProgress}
          onReload={data.reload}
        />
      ) : null}

      <div className="osrs-mmg__kph-row">
        <div className="osrs-mmg__kph-controls">
          <label className="osrs-mmg__field">
            {activeGuide.kphUnitName}
            <input
              type="number"
              min={0}
              step="any"
              value={kph}
              onChange={(event) => onKphChange(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={onResetKph}>
            Reset
          </button>
        </div>
        <div className="osrs-mmg__field osrs-mmg__kph-skills">
          <span>Skill requirements</span>
          <OsrsMmgSkillIcons skills={activeGuide.skillRequirements} compact />
        </div>
      </div>

      <section className="osrs-mmg__summary">
        <div className={result.profit >= 0 ? "osrs-mmg__metric osrs-mmg__metric--profit-up" : "osrs-mmg__metric osrs-mmg__metric--profit-down"}>
          <span>Profit</span>
          <strong>{formatGp(result.profit)}</strong>
        </div>
        <div className="osrs-mmg__metric osrs-mmg__metric--inputs">
          <span>Inputs</span>
          <strong>{formatGp(result.inputTotal)}</strong>
        </div>
        <div className="osrs-mmg__metric osrs-mmg__metric--outputs">
          <span>Outputs</span>
          <strong>{formatGp(result.outputTotal)}</strong>
        </div>
        <div className={`osrs-mmg__metric osrs-mmg__metric--margin-${marginTone(result.margin)}`}>
          <span>Margin</span>
          <strong>{formatMargin(result.margin)}</strong>
        </div>
      </section>

      <div className="osrs-mmg__columns">
        <LineTable title="Inputs" lines={result.inputs} sideTotal={result.inputTotal} />
        <LineTable title="Outputs" lines={result.outputs} sideTotal={result.outputTotal} />
      </div>

      {activeGuide.assumptionText ? (
        <p className="osrs-mmg__assumption">
          {splitWikiMetrics(activeGuide.assumptionText).map((part, index) =>
            part.metric ? (
              <strong key={index} className="osrs-mmg__assumption-metric">
                {part.text}
              </strong>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </p>
      ) : null}

      {(isLiveDataEnabled() ? data.ready : false) ? (
        <>
          <OsrsMmgTrendsPanel mode="single" methodId={activeGuide.id} methodName={activeGuide.methodName} />
          <OsrsMmgItemBreakdownPanel methodId={activeGuide.id} guide={activeGuide} kph={kph} />
        </>
      ) : null}
    </div>
  );
}
