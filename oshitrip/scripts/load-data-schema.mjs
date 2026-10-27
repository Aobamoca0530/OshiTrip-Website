import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compile the same validation schemas used by the application, without adding
// a second schema implementation or an extra TypeScript runtime dependency.
export async function loadDataSchema() {
  const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(app, '.desktop-cache', 'data-tools');
  await fs.mkdir(dir, { recursive: true });
  for (const name of ['schema', 'releases', 'shopping', 'announcements', 'data-bundle']) {
    const source = await fs.readFile(path.join(app, 'src', 'lib', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    await fs.writeFile(path.join(dir, `${name}.mjs`), compiled.replace(/from "\.\/([^".]+)"/g, 'from "./$1.mjs"'));
  }
  return import(pathToFileURL(path.join(dir, 'data-bundle.mjs')).href);
}
