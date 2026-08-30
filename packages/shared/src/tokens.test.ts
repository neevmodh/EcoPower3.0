import { describe, expect, it } from "vitest";
import { generateCssVariables, sequential, tailwindColors } from "./tokens";

describe("tokens", () => {
  it("declares dark values under both the media query and the data-theme selector", () => {
    const css = generateCssVariables();
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(':root[data-theme="light"]');
  });

  it("emits a CSS custom property per sequential ramp step", () => {
    const css = generateCssVariables();
    sequential.ramp.forEach((_, i) => {
      expect(css).toContain(`--color-sequential-${i}:`);
    });
  });

  it("produces a Tailwind-consumable color object for each theme", () => {
    const light = tailwindColors("light");
    const dark = tailwindColors("dark");
    expect(light.generation).not.toBe(dark.generation);
    expect(light.sequential).toEqual(sequential.ramp);
  });
});
