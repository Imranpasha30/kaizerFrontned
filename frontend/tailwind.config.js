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
        border:  "#1a1a1a",
        muted:   "#555555",
      },
    },
  },
  plugins: [],
};
