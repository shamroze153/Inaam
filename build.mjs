// Bundles src/ into a single self-contained dist/index.html (only Google Fonts load from the web).
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/style.css', 'utf8');
let html = fs.readFileSync('src/index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`);
html = html.replace('<script type="module" src="main.js"></script>', () => `<script>${js}</script>`);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
