import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendors pesados usados por um único módulo lazy-loaded ficam no
        // chunk desse módulo, em vez de caírem no bundle principal.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // recharts (+ deps d3-*) — usado só em src/pages/financeiro
          if (
            id.includes("/recharts/") ||
            id.includes("/d3-") ||
            id.includes("/victory-vendor/")
          ) {
            return "financeiro-vendor";
          }

          // html2canvas + @dnd-kit — usados só em src/pages/comercial-atacado
          if (id.includes("/html2canvas/") || id.includes("/@dnd-kit/")) {
            return "comercial-atacado-vendor";
          }

          return undefined;
        },
      },
    },
  },
}));
