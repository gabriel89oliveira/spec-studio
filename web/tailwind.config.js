import typography from "@tailwindcss/typography";

/** Cores vêm das variáveis CSS de src/index.css (claro e escuro). */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        desk: token("desk"),
        panel: token("panel"),
        sheet: token("sheet"),
        ink: { DEFAULT: token("ink"), 2: token("ink-2"), 3: token("ink-3") },
        line: { DEFAULT: token("line"), strong: token("line-strong") },
        accent: { DEFAULT: token("accent"), soft: token("accent-soft"), ink: token("accent-ink") },
        claude: { DEFAULT: token("claude"), soft: token("claude-soft"), ink: token("claude-ink") },
        mark: { DEFAULT: token("mark"), soft: token("mark-soft"), ink: token("mark-ink") },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft") },
        add: { DEFAULT: token("add"), soft: token("add-soft") },
        del: { DEFAULT: token("del"), soft: token("del-soft") },
      },
      fontFamily: {
        sans: ['"Barlow"', "ui-sans-serif", "system-ui", '"Segoe UI"', "sans-serif"],
        cond: ['"Barlow Semi Condensed"', '"Barlow"', "ui-sans-serif", "sans-serif"],
        serif: ['"Source Serif 4 Variable"', '"Source Serif 4"', "Georgia", "serif"],
        mono: ["ui-monospace", '"Cascadia Code"', "Consolas", '"SF Mono"', "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", "15px"],
        xs: ["12.5px", "17px"],
        sm: ["14px", "20px"],
      },
      boxShadow: {
        sheet: "var(--shadow-sheet)",
        lift: "var(--shadow-lift)",
      },
    },
  },
  plugins: [typography],
};
