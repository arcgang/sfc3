import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    server: {
      deps: {
        external: ["better-sqlite3"],
      },
    },
  },
});
