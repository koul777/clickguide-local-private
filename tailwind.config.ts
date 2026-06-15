import type { Config } from "tailwindcss";

export default {
  content: ["./popup.html", "./guide-editor.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        panel: "#f7f8f5",
        line: "#d8ded8",
        brand: "#0f766e",
        danger: "#b42318",
        warn: "#b7791f"
      },
      boxShadow: {
        tool: "0 1px 2px rgba(23,32,38,0.08), 0 8px 24px rgba(23,32,38,0.06)"
      }
    }
  },
  plugins: []
} satisfies Config;
