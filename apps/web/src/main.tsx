import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/app";
import { AppProviders } from "@/app/providers";
import "@/styles/globals.css";
import "@/styles/cloud-shell.css";
import "@/styles/console.css";
import "@/styles/cloud-pages.css";
import "@/styles/cloud-home.css";
import "@/styles/cloud-grants.css";
import "@/styles/dc-control.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
