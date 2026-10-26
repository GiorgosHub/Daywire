// Build: bundle the client TypeScript and CSS with esbuild, copy static files into dist/.
import { build } from "esbuild";
import { cp, mkdir, rename, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await build({
  entryPoints: { app: "src/main.ts", "app-style": "src/styles/index.css" },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: ["es2022", "safari16"],
  minify: true,
  external: ["/fonts/*"],
  legalComments: "none",
  charset: "utf8",
  logLevel: "info",
});
await rename("dist/app-style.css", "dist/app.css");
await rm("dist/app-style.js", { force: true });
