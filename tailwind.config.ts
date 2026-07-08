import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ebff",
          200: "#bcdcff",
          300: "#8ec6ff",
          400: "#59a5ff",
          500: "#3382fc",
          600: "#1d62f1",
          700: "#154cde",
          800: "#173fb4",
          900: "#19398d",
          950: "#142456",
        },
      },
    },
  },
  plugins: [],
};

export default config;
