import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

const OsrsMmgRankingsPage = lazy(() => import("./osrs-mmg/OsrsMmgRankingsPage"));
const OsrsMmgCalculatorPage = lazy(() => import("./osrs-mmg/OsrsMmgCalculatorPage"));
const OsrsCharacterPage = lazy(() => import("./osrs-character/OsrsCharacterPage"));

function PageFallback() {
  return <div className="osrs-mmg"><p>Loading…</p></div>;
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <a className="osrs-app__home" href="/">
        ← OSRS tools
      </a>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<OsrsMmgRankingsPage />} />
          <Route path="/m/:methodId" element={<OsrsMmgCalculatorPage />} />
          <Route path="/c" element={<OsrsCharacterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster richColors position="top-center" />
    </BrowserRouter>
  );
}
