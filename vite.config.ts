import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

/** Long-lived vendor chunks: app releases don't invalidate these. */
const VENDOR_CHUNKS: Record<string, string> = {
  react: "vendor-react",
  "react-dom": "vendor-react",
  "react-router-dom": "vendor-react",
  "@supabase/supabase-js": "vendor-data",
  "@tanstack/react-query": "vendor-data",
  "@radix-ui/react-dialog": "vendor-ui",
  "@radix-ui/react-dropdown-menu": "vendor-ui",
  "@radix-ui/react-popover": "vendor-ui",
  "@radix-ui/react-select": "vendor-ui",
  "@radix-ui/react-tooltip": "vendor-ui",
  "@radix-ui/react-tabs": "vendor-ui",
  cmdk: "vendor-ui",
  "lucide-react": "vendor-ui",
  recharts: "vendor-charts",
};

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    // Installable app. Only the app shell (JS/CSS/HTML/icons) is cached; Supabase data is
    // always fetched live, so nobody ever sees another session's or a stale balance.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-32.png", "icons/icon-180.png"],
      manifest: {
        name: "Smart POS",
        short_name: "Smart POS",
        description: "Record sales, credits and stock, and manage your team.",
        start_url: "/app",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#ffffff",
        theme_color: "#2667d9",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
        // Only needed for exports / the demo: never precached, so normal visitors don't
        // download them (PGlite's .wasm/.data files aren't matched by globPatterns either).
        globIgnores: ["**/exceljs*.js", "**/demo-*.js"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/auth\/v1/, /^\/rest\/v1/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co"),
            handler: "NetworkOnly",
          },
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  // PGlite loads its own .wasm/.data files; pre-bundling would break those URLs.
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.split("\\").join("/");
          // Only the demo imports PGlite. (Demo code itself is NOT assigned here: a manual
          // chunk drags in shared app modules, which would make the app load it.)
          if (normalized.includes("/node_modules/@electric-sql/pglite/")) return "demo-pglite";
          const pkg = normalized.match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1];
          return pkg ? VENDOR_CHUNKS[pkg] : undefined;
        },
        // The chunk behind import("@/demo") gets a recognisable name, so the service worker
        // can skip it (see globIgnores).
        chunkFileNames: (chunk) =>
          chunk.facadeModuleId?.split("\\").join("/").endsWith("/src/demo/index.ts")
            ? "assets/demo-[hash].js"
            : "assets/[name]-[hash].js",
      },
    },
  },
}));
