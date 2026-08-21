import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        may: {
          bone: "hsl(var(--may-bone-white))",
          charcoal: "hsl(var(--may-charcoal))",
          mist: "hsl(var(--may-river-mist))",
          redwood: "hsl(var(--may-redwood-green))",
          magenta: "hsl(var(--may-cosmic-magenta))",
          amber: "hsl(var(--may-festival-amber))",
          plum: "hsl(var(--may-indigo-plum))",
        },
        preview: {
          bg: "hsl(var(--preview-bg))",
          surface: "hsl(var(--preview-surface))",
          text: "hsl(var(--preview-text))",
          muted: "hsl(var(--preview-muted))",
          accent: "hsl(var(--preview-accent))",
          border: "hsl(var(--preview-border))",
          dark: "hsl(var(--preview-dark))",
        },
        // Admin-specific colors (Notion/Attio inspired)
        admin: {
          bg: "hsl(var(--admin-bg))",
          surface: "hsl(var(--admin-surface))",
          "surface-hover": "hsl(var(--admin-hover))",
          text: "hsl(var(--admin-text))",
          "text-secondary": "hsl(var(--admin-text-secondary))",
          "text-muted": "hsl(var(--admin-text-muted))",
          border: "hsl(var(--admin-border))",
          "border-strong": "hsl(var(--admin-border-strong))",
          primary: "hsl(var(--admin-primary))",
          "primary-foreground": "hsl(var(--admin-primary-foreground))",
          accent: "hsl(var(--admin-accent))",
          "accent-muted": "hsl(var(--admin-accent-muted))",
          success: "hsl(var(--admin-success))",
          "success-muted": "hsl(var(--admin-success-muted))",
          warning: "hsl(var(--admin-warning))",
          "warning-muted": "hsl(var(--admin-warning-muted))",
          error: "hsl(var(--admin-error))",
          "error-muted": "hsl(var(--admin-error-muted))",
          info: "hsl(var(--admin-info))",
          "info-muted": "hsl(var(--admin-info-muted))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 6s ease-in-out infinite",
        "fade-in": "fadeIn 1s ease-out forwards",
      },
      backgroundImage: {
        "gradient-brass": "var(--gradient-brass)",
        "gradient-vignette": "var(--gradient-vignette)",
      },
      fontFamily: {
        serif: ["'Cormorant Garamond'", "serif"],
        display: ["'Fraunces'", "serif"],
        sans: ["'Inter'", "sans-serif"],
        taylosa: ["'Tay Losa'", "sans-serif"],
        serialb: ["'Serial B'", "sans-serif"],
        admin: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      boxShadow: {
        brass: "var(--shadow-brass)",
        soft: "var(--shadow-soft)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
