import { defineConfig } from "vitest/config";

// Only the ingest/simulator worker sources have tests — everything else in
// this app is React (Next.js) UI, which this repo doesn't unit-test.
export default defineConfig({
  test: {
    environment: "node",
    include: ["workers/**/*.test.ts"],
  },
});
