/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        accent:  "#c0392b",
        accent2: "#e74c3c",
        dark:    "#080808",
        panel:   "#0e0e0e",
        "panel-hover": "#141414",
        surface: "#111111",
        border:  "#1a1a1a",
        "border-hover": "#2a2a2a",
        muted:   "#555555",
      },
      screens: {
        "3xl": "1920px",
      },
      maxWidth: {
        "8xl": "88rem",
      },
    },
  },
  plugins: [],
};
