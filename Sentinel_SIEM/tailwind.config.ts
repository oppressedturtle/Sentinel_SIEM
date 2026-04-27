import type { Config } from "tailwindcss";

export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#101418",
          900: "#161b20",
          800: "#20272e",
          700: "#2b343c"
        },
        signal: {
          cyan: "#1f9fb4",
          green: "#2f9e66",
          amber: "#c9831f",
          red: "#c94d4d",
          violet: "#755cc9"
        }
      },
      boxShadow: {
        panel: "0 16px 40px rgba(16, 20, 24, 0.10)"
      }
    }
  },
  plugins: []
} satisfies Config;
