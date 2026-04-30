import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ToastCenterProvider } from "./components/surface/ToastCenter";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastCenterProvider>
      <App />
    </ToastCenterProvider>
  </React.StrictMode>,
);
