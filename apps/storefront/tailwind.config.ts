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
          cream: "#FAF7F2",           // soft warm cream — primary background
          "cream-dark": "#F0EBE1",    // slightly deeper cream — card backgrounds
          sage: "#7A9E7E",            // warm sage — decorative/borders only (fails 4.5:1 on cream)
          "sage-light": "#A8C5AB",    // lighter sage — decorative
          "sage-dark": "#5A7E5E",     // deeper sage — decorative
          "sage-btn": "#2F5233",      // WCAG AA on cream (8.5:1) — use for button bg / actionable UI
          terracotta: "#C4704A",      // terracotta — decorative/large-text only (fails 4.5:1 on cream)
          "terracotta-light": "#D4886A", // lighter terracotta — decorative
          "terracotta-text": "#7A3318", // WCAG AA on cream (8.5:1) — use for text / button bg
          ink: "#2C2417",             // warm near-black — primary text
          "ink-muted": "#6B5E4E",     // warm mid-gray — secondary text
          "ink-subtle": "#A89880",    // warm light-gray — placeholder, disabled
          border: "#E5DDD4",          // warm gray — borders/dividers
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
