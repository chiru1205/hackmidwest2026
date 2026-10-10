import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/legacy.css";
import App from "./App";
import { ROLE } from "./lib/auth";

if (ROLE === "city") {
  document.title = "Civic Flow - City operations";
} else {
  // Installable citizen app only; the city portal is a website.
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/manifest.webmanifest";
  document.head.appendChild(link);
  const apple = document.createElement("link");
  apple.rel = "apple-touch-icon";
  apple.href = "/icon-192.png";
  document.head.appendChild(apple);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
