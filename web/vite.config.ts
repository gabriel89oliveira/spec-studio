import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Lê o .env da raiz do spec-studio para usar a mesma porta do servidor.
  const env = loadEnv(mode, "..", "");
  const apiPort = env.PORT || "3001";
  return {
    plugins: [react()],
    build: { chunkSizeWarningLimit: 2000 },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
      },
    },
  };
});
