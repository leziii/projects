import { createSSRApp } from "vue";
import App from "./App.vue";
import { keepBackArrow } from "./nav";

if (typeof history !== "undefined") keepBackArrow(history);

export function createApp() {
  const app = createSSRApp(App);
  return {
    app,
  };
}
