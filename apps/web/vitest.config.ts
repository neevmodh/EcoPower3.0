import { defineConfig } from "vitest/config";

// The ingest/simulator worker sources and API route handlers (plain
// functions, not React) have tests — everything else in this app is React
// (Next.js) UI, which this repo doesn't unit-test.
export default defineConfig({
  test: {
    environment: "node",
    include: ["workers/**/*.test.ts", "app/api/**/*.test.ts"],
  },
});
