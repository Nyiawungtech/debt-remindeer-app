import React from "react";
import { createRoot } from "react-dom/client";
import { IonApp, setupIonicReact } from "@ionic/react";
import "@ionic/react/css/core.css";
import App from "./App";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "./styles.css";
setupIonicReact({ mode: "md" });
class AppBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="empty">
        <h1>Let’s try that again.</h1>
        <p>
          Something interrupted this screen. Your saved account data is safe in
          your workspace.
        </p>
        <button className="primary" onClick={() => location.reload()}>
          Reload SettleUp
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <IonApp>
      <AppBoundary>
        <App />
      </AppBoundary>
    </IonApp>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              window.dispatchEvent(new Event("settleup-update"));
          });
        });
      })
      .catch(() => {});
  });
