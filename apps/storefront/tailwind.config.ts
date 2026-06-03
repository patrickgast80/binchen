import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Binchen brand tokens — swap here when brand owner delivers final palette
        binchen: {
          cream: "#FAF7F2",       // soft warm cream — primary background
          "cream-dark": "#F0EBE1", // slightly deeper cream — card backgrounds
          sage: "#7A9E7E",         // warm sage — primary brand green
          "sage-light": "#A8C5AB", // lighter sage — hover states
          "sage-dark": "#5A7E5E",  // deeper sage — active/pressed
          terracotta: "#C4704A",   // terracotta accent — CTAs, highlights
          "terracotta-light": "#D4886A", // lighter terracotta — hover
          ink: "#2C2417",          // warm near-black — primary text
          "ink-muted": "#6B5E4E",  // warm mid-gray — secondary text
          "ink-subtle": "#A89880", // warm light-gray — placeholder, disabled
          border: "#E5DDD4",       // warm gray — borders/dividers
        },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["3.5rem", { lineHeight: "1.1", fontWeight: "600" }],
        "display-lg": ["2.5rem", { lineHeight: "1.15", fontWeight: "600" }],
        "display-md": ["1.875rem", { lineHeight: "1.2", fontWeight: "600" }],
        "display-sm": ["1.5rem", { lineHeight: "1.25", fontWeight: "600" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
