// Builds a self-contained release into dist/: one HTML file (CSS + JS inlined
// and minified) plus the assets folder. Works from file:// or any static host.
import { readFile, writeFile, rm, mkdir, cp } from 'node:fs/promises';
import { transform } from 'esbuild';

const html = await readFile('index.html', 'utf8');
const css = (await transform(await readFile('src/style.css', 'utf8'), { loader: 'css', minify: true })).code;
const js = (await transform(await readFile('src/main.js', 'utf8'), { loader: 'js', minify: true, target: 'es2019' })).code;

const cssTag = '<link rel="stylesheet" href="src/style.css">';
const jsTag = '<script src="src/main.js"></script>';
if (!html.includes(cssTag) || !html.includes(jsTag)) throw new Error('index.html is missing the css/js tags the build expects');

const out = html
  .replace(cssTag, () => `<style>${css.trim()}</style>`)
  .replace(jsTag, () => `<script>${js.trim()}</script>`);

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', out);
await cp('assets', 'dist/assets', { recursive: true });
await cp('CREDITS.md', 'dist/CREDITS.md');
console.log(`dist/index.html  ${(out.length / 1024).toFixed(1)} KB`);
