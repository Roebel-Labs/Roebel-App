// Tailwind CSS preset consuming shared design tokens
// Used by apps/web/tailwind.config.ts

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#EBF0F7",
          100: "#D6E1EF",
          200: "#B0C5DF",
          300: "#8AA9CF",
          400: "#5483B5",
          500: "#1E4D8C",
          600: "#194383",
          700: "#143670",
          800: "#0F295D",
          900: "#0A1A30",
        },
        amber: {
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
        },
      },
      fontFamily: {
        heading: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      spacing: {
        page: "16px",
        card: "16px",
        section: "24px",
      },
    },
  },
};
