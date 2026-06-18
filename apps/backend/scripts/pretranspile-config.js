#!/usr/bin/env node
// Pre-transpile medusa-config.ts and src/modules/**/*.ts into sibling .js files
// so that `medusa build`'s defineConfig() can require("./src/modules/<name>")
// from inside the Docker builder stage, where only .ts sources exist (until
// `medusa build` itself emits .medusa/server). Matches BIL-2172.
//
// Run from the apps/backend directory:
//   node scripts/pretranspile-config.js
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const MODULES_ROOT = path.join(BACKEND_ROOT, "src", "modules");
const CONFIG_TS = path.join(BACKEND_ROOT, "medusa-config.ts");

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2021,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
};

function emit(tsPath) {
  const source = fs.readFileSync(tsPath, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions,
    fileName: tsPath,
  });
  const jsPath = tsPath.replace(/\.ts$/, ".js");
  fs.writeFileSync(jsPath, result.outputText);
  console.log("pre-transpiled", path.relative(BACKEND_ROOT, jsPath));
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.isFile() && p.endsWith(".ts") && !p.endsWith(".d.ts")) emit(p);
  }
}

if (fs.existsSync(CONFIG_TS)) emit(CONFIG_TS);
if (fs.existsSync(MODULES_ROOT)) walk(MODULES_ROOT);
