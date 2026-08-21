import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    {
      name: 'cache-bust-version',
      transformIndexHtml(html: string) {
        return html.replace('__BUILD_TS__', Date.now().toString(36));
      },
    },
    mode === "development" && componentTagger(),
    mode === "production" && visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean) as PluginOption[],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true,
    // NOTE: Vite's default output filenames include a content hash
    // (assets/[name]-[hash].js, assets/[name]-[hash].css). DO NOT override
    // entryFileNames / chunkFileNames / assetFileNames to remove the hash —
    // hashed asset names are what makes long-term HTTP caching of /assets/*
    // safe. Only index.html (which references assets by hashed name) needs
    // to be revalidated on each deploy. Cache-busting in index.html + the
    // runtime version poll in src/main.tsx handle that.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-tabs', '@radix-ui/react-select'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
}));
