import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DATA_ROOT = path.resolve(__dirname, "..", "data");
const OUT_DIR = path.resolve(__dirname, "..", "mmg");

const LOCAL_DATA_MIME: Record<string, string> = {
  ".duckdb": "application/x-duckdb",
  ".json": "application/json",
};

/** Dev-only: serve gitignored files from ../data at /local-data/. */
function serveLocalData(): Plugin {
  return {
    name: "serve-local-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/local-data", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
        const filePath = path.resolve(LOCAL_DATA_ROOT, rel.replace(/^\//, ""));
        if (!filePath.startsWith(`${LOCAL_DATA_ROOT}${path.sep}`) && filePath !== LOCAL_DATA_ROOT) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        const ext = path.extname(filePath);
        res.setHeader("Content-Type", LOCAL_DATA_MIME[ext] ?? "application/octet-stream");
        createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), wasm(), serveLocalData()],
  base: command === "build" ? "/mmg/" : "/",
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    target: "esnext",
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: [__dirname, LOCAL_DATA_ROOT],
    },
  },
  worker: {
    format: "es",
  },
}));
