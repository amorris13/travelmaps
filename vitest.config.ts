import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["lib/__tests__/**/*.test.ts", "web/src/**/*.test.tsx"],
    alias: {
      "@": path.resolve(__dirname, "./web/src"),
      "@lib": path.resolve(__dirname, "./lib"),
    },
  },
});
