import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:4000';

  return {
    server: {
      host: true,
      port: 8081,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom"],
    },
    // In production, call Railway backend directly
    // In development, use empty string (Vite proxy handles it)
    define: {
      'import.meta.env.VITE_API_URL': mode === 'production'
        ? JSON.stringify('https://stunning-adaptation-production-8960.up.railway.app')
        : JSON.stringify(''),
    },
  };
});
