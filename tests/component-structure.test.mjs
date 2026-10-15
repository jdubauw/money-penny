import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const source = fileURLToPath(new URL('../frontend/src/', import.meta.url));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory,entry.name)) : path.join(directory,entry.name)))).flat();
}
test('component modules define at most one React component', async () => {
  const modules = [...await files(path.join(source,'components')), ...await files(path.join(source,'pages')), path.join(source,'app.tsx')];
  const violations=[];
  for (const file of modules.filter(file=>file.endsWith('.tsx'))) {
    const contents=await readFile(file,'utf8');
    const declarations=[...contents.matchAll(/^(?:export\s+)?(?:function|const)\s+([A-Z]\w*)/gm)].map(match=>match[1]);
    if(declarations.length>1) violations.push(`${path.relative(source,file)}: ${declarations.join(', ')}`);
  }
  assert.deepEqual(violations,[], 'Move each component definition into its own file.');
});
