const palette = require("../../packages/shared/src/palette.json");

// React Native has no CSS custom properties / prefers-color-scheme media
// query the way web's generateCssVariables() (packages/shared/src/tokens.ts)
// uses — NativeWind resolves classes to static values at build time. Same
// source of truth (palette.json), light values only for now: app.json pins
// userInterfaceStyle to "light" app-wide, so wiring a dark variant here
// would be dead code until that changes, not a shortcut taken to save time.
function lightColors(group) {
  return Object.fromEntries(
    Object.entries(group).map(([name, v]) => [name, v.light ?? v]),
  );
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        categorical: lightColors(palette.categorical),
        diverging: lightColors(palette.diverging),
        status: lightColors(palette.status),
        sequential: Object.fromEntries(
          palette.sequential.ramp.map((hex, i) => [i, hex]),
        ),
        surface: palette.surface.light,
      },
    },
  },
  plugins: [],
};
