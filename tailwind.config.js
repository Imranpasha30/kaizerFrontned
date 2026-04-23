/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: ["Inter", "ui-sans-serif", "system-ui"],
      },
      colors: {
        accent:  "#c0392b",
        accent2: "#e74c3c",
        accent3: "#f39c12",
        dark:    "#080808",
        panel:   "#0e0e0e",
        "panel-hover": "#141414",
        surface: "#111111",
        border:  "#1a1a1a",
        "border-hover": "#2a2a2a",
        muted:   "#555555",
        ink: {
          50:  "#f5f5f5",
          100: "#e5e5e5",
          200: "#c6c6c6",
          300: "#a2a2a2",
          400: "#7e7e7e",
          500: "#5c5c5c",
          600: "#3f3f3f",
          700: "#2a2a2a",
          800: "#181818",
          900: "#0c0c0c",
          950: "#050505",
        },
      },
      screens: {
        "3xl": "1920px",
      },
      maxWidth: {
        "8xl": "88rem",
      },
      borderRadius: {
        xl2: "1rem",
        xl3: "1.5rem",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(231,76,60,0.15), 0 10px 40px -10px rgba(231,76,60,0.35)",
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 20px 40px -24px rgba(0,0,0,0.8)",
        elevated: "0 20px 60px -20px rgba(0,0,0,0.8), 0 8px 20px -12px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 50% 0%, rgba(231,76,60,0.12), transparent 60%)",
        "hero-sheen":
          "linear-gradient(135deg, rgba(231,76,60,0.25) 0%, rgba(243,156,18,0.12) 40%, transparent 80%)",
        "panel-sheen":
          "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)",
      },
      animation: {
        "fade-in":  "fade-in 400ms ease-out both",
        "rise":     "rise 500ms cubic-bezier(0.2,0.7,0.1,1) both",
        "pulse-soft": "pulse-soft 2.8s ease-in-out infinite",
        "shimmer":  "shimmer 2.2s linear infinite",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        "rise": {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%,100%": { opacity: 0.85 },
          "50%":      { opacity: 1 },
        },
        "shimmer": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
