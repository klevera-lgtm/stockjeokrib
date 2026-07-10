import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "stockjeokrib",
  brand: {
    displayName: "주식적립왕",
    primaryColor: "#3182F6",
    icon: "",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
});
