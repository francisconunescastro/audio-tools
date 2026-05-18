import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  // Light-mode only — no dark: variants used

  theme: {
    extend: {
      fontFamily: {
        display: ["'Season Musiversal'", "Georgia", "serif"],
        season:  ["'Season'", "Georgia", "serif"],
        inter:   ["'Inter'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ivory:         "#F4F3F1",
        ebony:         "#000000",
        "brand-yellow": "#F9C026",
        "brand-pink":   "#C8506A",
        "brand-teal":   "#29B892",
        "brand-teal-50":  "#EEFBF6",
        "brand-pink-50":  "#FBF3F5",
        "brand-yellow-50": "#FFFBEB",
        "brand-blue-50":   "#EFFCFC",
        "warm-100": "#E7E5E0",
        "warm-200": "#D1CFC5",
      },
      borderRadius: {
        DEFAULT: "0px",
      },
    },
  },
  plugins: [],
};

export default config;
