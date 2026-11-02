import type { Config } from "tailwindcss";

// Colour values from the Hearay design canvas.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F6F8",
        ink: { DEFAULT: "#101418", muted: "#5B6470", faint: "#8A929C" },
        accent: { DEFAULT: "#1F4FD8", dark: "#183EAB", soft: "#E8EEFC" },
        line: "#E3E6EB",
        mtn: "#FFCB05",
        orange: "#FF7900",
        success: { DEFAULT: "#13804B", soft: "#E5F4EC" },
        danger: { DEFAULT: "#C62828", soft: "#FCEBEB" },
        warn: { DEFAULT: "#9A6200", soft: "#FFF4DE" },
      },
      fontFamily: {
        sans: ['"Manrope Variable"', "Manrope", "system-ui", "sans-serif"],
      },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
      maxWidth: { phone: "420px" },
    },
  },
  plugins: [],
};
export default config;
