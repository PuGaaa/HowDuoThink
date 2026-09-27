#!/usr/bin/env node
/** 把 app/data/cases/*.ts 案例导出为 JSON（server seed 用）——与 validate.mjs 同样的剥类型技巧。
 *  用法：node export-case.mjs <case.ts> <out.json> [caseVarName]
 *  不带参数时导出 cases/index.ts 注册表内全部案例到 out 目录。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

function loadCase(path) {
  const src = readFileSync(path, 'utf8');
  const nameMatch = src.match(/export\s+const\s+(\w+)/);
  if (!nameMatch) throw new Error('no export const in ' + path);
  const varName = nameMatch[1];
  const body = src
    .replace(/^import\s+.*$/gm, '')
    .replace(/export\s+const/, 'const')
    .replace(new RegExp(`const\\s+${varName}\\s*:\\s*\\w+`), `const ${varName}`);
  return new Function(`${body}; return ${varName};`)();
}

const argPath = process.argv[2];
const argOut = process.argv[3];

if (argPath) {
  const c = loadCase(argPath);
  writeFileSync(argOut, JSON.stringify(c, null, 2));
  console.log('exported', c.id, '→', argOut);
} else {
  const outDir = join(HERE, '..', '..', 'server', 'seed');
  mkdirSync(outDir, { recursive: true });
  const indexSrc = readFileSync(join(ROOT, 'app/data/cases/index.ts'), 'utf8');
  const ids = [...indexSrc.matchAll(/import\s+\{\s*(\w+)\s*\}\s+from\s+'\.\/([\w-]+)'/g)]
    .filter((m) => m[1] !== 'DiagnosisCase');
  for (const m of ids) {
    const c = loadCase(join(ROOT, 'app/data/cases', m[2] + '.ts'));
    writeFileSync(join(outDir, c.id + '.json'), JSON.stringify(c, null, 2));
    console.log('exported', c.id);
  }
}
