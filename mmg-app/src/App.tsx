import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "sonner";

import { CHARACTER_PATH, MMG_PATH, QUESTS_PATH, questPath } from "./routes";

const OsrsMmgRankingsPage = lazy(() => import("./osrs-mmg/OsrsMmgRankingsPage"));
const OsrsMmgCalculatorPage = lazy(() => import("./osrs-mmg/OsrsMmgCalculatorPage"));
const OsrsCharacterPage = lazy(() => import("./osrs-character/OsrsCharacterPage"));
const OsrsQuestGraphPage = lazy(() => import("./osrs-quests/OsrsQuestGraphPage"));

function PageFallback() {
  return <div className="osrs-mmg"><p>Loading…</p></div>;
}

function RedirectLegacyQuest() {
  const { nodeId } = useParams();
  return <Navigate to={questPath(nodeId)} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <div className="osrs-app">
        <div className="osrs-app__scroll">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to={MMG_PATH} replace />} />
              <Route path={MMG_PATH} element={<OsrsMmgRankingsPage />} />
              <Route path="/mmg/m/:methodId" element={<OsrsMmgCalculatorPage />} />
              <Route path={CHARACTER_PATH} element={<OsrsCharacterPage />} />
              <Route path={QUESTS_PATH} element={<OsrsQuestGraphPage />} />
              <Route path="/quests/:nodeId" element={<OsrsQuestGraphPage />} />
              <Route path="/q" element={<Navigate to={QUESTS_PATH} replace />} />
              <Route path="/q/:nodeId" element={<RedirectLegacyQuest />} />
              <Route path="/mmg/q" element={<Navigate to={QUESTS_PATH} replace />} />
              <Route path="/mmg/q/:nodeId" element={<RedirectLegacyQuest />} />
              <Route path="*" element={<Navigate to={MMG_PATH} replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
      <Toaster richColors position="top-center" />
    </BrowserRouter>
  );
}
