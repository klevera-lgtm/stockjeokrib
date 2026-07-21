import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "stockjeokrib",
  brand: {
    displayName: "주식적립왕",
    primaryColor: "#3182F6",
    icon: "https://static.toss.im/appsintoss/56841/225a95fa-30b9-43eb-8cc7-b894fdeb40a5.png",
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
