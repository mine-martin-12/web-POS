import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { DemoBoot } from './DemoBoot.tsx'
import { DEMO_URL_PARAM, isDemoMode, setDemoMode } from './data/mode'
import './index.css'

// ?demo=1 (a shared link) turns demo mode on for this tab; the parameter is then dropped.
const url = new URL(window.location.href);
if (url.searchParams.get(DEMO_URL_PARAM) === "1") {
  setDemoMode(true);
  url.searchParams.delete(DEMO_URL_PARAM);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

createRoot(document.getElementById("root")!).render(
  isDemoMode() ? (
    <DemoBoot>
      <App />
    </DemoBoot>
  ) : (
    <App />
  ),
);
