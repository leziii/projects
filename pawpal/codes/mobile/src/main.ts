import { createSSRApp } from "vue";
import App from "./App.vue";
import { keepBackArrow } from "./nav";
import { initSentry } from "./sentry";

if (typeof history !== "undefined") keepBackArrow(history);

export function createApp() {
  const app = createSSRApp(App);
  initSentry(app, import.meta.env.VITE_SENTRY_DSN as string | undefined); // R61-1: off unless set
  return {
    app,
  };
}
