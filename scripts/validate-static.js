const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(root);
for (const file of files.filter(file => file.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}
for (const file of files.filter(file => file.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)) {
    throw new Error(`${path.relative(root, file)} uses root-absolute asset path ${match[1]}`);
  }
}
console.log(`Static validation passed for ${files.length} files.`);
