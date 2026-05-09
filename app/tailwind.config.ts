import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cat: { DEFAULT: "#f59e0b", dark: "#92400e" },
        lobster: { DEFAULT: "#dc2626", dark: "#7f1d1d" },
      },
    },
  },
  plugins: [],
};
export default config;
