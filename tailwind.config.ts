import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16140F", // near-black warm charcoal — left rail / dark surfaces
        pearl: "#F7F4EE", // warm ivory — canvas background
        gold: {
          DEFAULT: "#B8935F", // muted antique gold — primary accent
          bright: "#D4AF7A", // hover / active state
        },
        stone: "#8B8478", // warm grey — secondary text
        line: {
          dark: "#2A2820", // hairline on ink surfaces
          light: "#E4DFD3", // hairline on pearl surfaces
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
