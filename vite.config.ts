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
        // Vendors pesados ficam em chunks próprios, baixados só pelas rotas
        // lazy que os usam; o núcleo (React/router/Supabase/Query) vai num
        // chunk estável que sobrevive em cache entre deploys.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // recharts (+ deps d3-*) — financeiro, unidades
          if (
            id.includes("/recharts/") ||
            id.includes("/d3-") ||
            id.includes("/victory-vendor/")
          ) {
            return "charts-vendor";
          }

          // html2canvas — exportar imagem de pedido/cupom/catálogo (admin comercial)
          if (id.includes("/html2canvas/")) return "html2canvas-vendor";

          // @dnd-kit — kanbans do RH/DP e ordenação no catálogo/formulário
          if (id.includes("/@dnd-kit/")) return "dnd-vendor";

          if (
            /\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run|@supabase|@tanstack|clsx|tailwind-merge)\//.test(
              id.replace(/\\/g, "/"),
            )
          ) {
            return "core-vendor";
          }

          return undefined;
        },
      },
    },
  },
}));
