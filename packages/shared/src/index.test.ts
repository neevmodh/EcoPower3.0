import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";

describe("packages/shared", () => {
  it("is importable", () => {
    expect(PACKAGE_NAME).toBe("@ecopower/shared");
  });
});
