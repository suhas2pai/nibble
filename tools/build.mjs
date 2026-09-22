// Validates content, then bundles CSS + JS + all content into one file: dist/index.html
// That file works by double-click, and can be uploaded to any static host.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, validate } from './validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const content = loadContent(root);
const { errors, warnings } = validate(content);
warnings.forEach((w) => console.log(`warning  ${w}`));
if (errors.length) {
  errors.forEach((e) => console.log(`error    ${e}`));
  console.log(`\nBuild stopped: ${errors.length} content errors.`);
  process.exit(1);
}

const tpl = readFileSync(join(root, 'src/index.html'), 'utf8');
const css = readFileSync(join(root, 'src/app.css'), 'utf8');
const js = readFileSync(join(root, 'src/engine.js'), 'utf8');
const sw = readFileSync(join(root, 'src/sw.js'), 'utf8');
const json = JSON.stringify({ config: content.config, course: content.course, lessons: content.lessons }).replace(/</g, '\\u003c');

const out = tpl
  .replace(/<!--CSS-->[\s\S]*?<!--\/CSS-->/, () => `<style>\n${css}\n</style>`)
  .replace(/<!--JS-->[\s\S]*?<!--\/JS-->/, () => `<script>window.__CONTENT__=${json};</script>\n<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), out);
writeFileSync(join(root, 'dist/sw.js'), sw);
console.log(`Built dist/index.html (${(out.length / 1024).toFixed(0)} KB, ${Object.keys(content.lessons).length} lessons)`);
