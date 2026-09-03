import path from "path";
import { defineConfig } from "vitest/config";

import { decoratorTransform } from "./vitest-decorator-transform.ts";

export default defineConfig({
  plugins: [decoratorTransform()],
  test: {
    include: ["src/**/*.integration.spec.ts", "src/**/*.integration.spec.tsx"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
  resolve: {
    conditions: ["module"],
    alias: {
      "typeferry/": path.resolve(import.meta.dirname, "src") + "/",
    },
  },
});
