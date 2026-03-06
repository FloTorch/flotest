import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: ["index.ts", "src/generator/prompt-worker.ts"],
  format: ["esm"],
  target: "node18",
  bundle: true,
  splitting: false,
  shims: true,
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  outDir: "dist",
  define: {
    __PKG_VERSION__: JSON.stringify(version),
  },
});
