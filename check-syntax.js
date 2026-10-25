'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

let failures = 0;
const files = walk(root);
for (const file of files) {
  const isClientModule = file.startsWith(path.join(root, 'public'));
  let target = file;
  if (isClientModule) { // módulos ES do navegador: verifica como .mjs
    target = path.join(os.tmpdir(), `check-${path.basename(file)}.mjs`);
    fs.copyFileSync(file, target);
  }
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.status !== 0) { failures += 1; console.error(`ERRO: ${path.relative(root, file)}\n${result.stderr}`); }
  else console.log(`ok  ${path.relative(root, file)}`);
}
console.log(`\n${files.length} arquivos verificados, ${failures} com erro.`);
process.exit(failures ? 1 : 0);
