import React from "react";
import ReactDOM from "react-dom/client";

import "./app.css";
import "./lib/i18n";
import { App } from "./app/App";
import { ErrorBoundary } from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
