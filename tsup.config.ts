import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  target: "node20",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
