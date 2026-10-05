// src/ altındaki uygulamayı static/dist/ altına derler: JS (esbuild, Preact), CSS (sass) ve yazı tipleri.
// Dosya adlarına içerik özeti eklenir; library.js bunları static/dist/manifest.json'dan okur.
import { readFile, writeFile, mkdir, readdir, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as esbuild from 'esbuild';
import * as sass from 'sass';

const watch = process.argv.includes('--watch');
const dist = 'static/dist';
const fontsDir = 'static/fonts';
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 10);

// Kendi sunucumuzdan sunulan yazı tipleri (OFL): latin + latin-ext, normal + italik
const FONTS = [
	['inter', '@fontsource-variable/inter'],
	['source-sans-3', '@fontsource-variable/source-sans-3'],
	['source-serif-4', '@fontsource-variable/source-serif-4'],
];

async function copyFonts() {
	await mkdir(fontsDir, { recursive: true });
	for (const [name, pkg] of FONTS) {
		const dir = path.join('node_modules', pkg, 'files');
		const files = (await readdir(dir)).filter(f => /^(.+)-(latin|latin-ext)-wght-(normal|italic)\.woff2$/.test(f));
		for (const f of files) {
			await copyFile(path.join(dir, f), path.join(fontsDir, f));
		}
		await copyFile(path.join('node_modules', pkg, 'LICENSE'), path.join(fontsDir, `LICENSE-${name}.txt`));
	}
}

async function buildOnce() {
	await mkdir(dist, { recursive: true });
	for (const f of await readdir(dist)) {
		if (/^cv\.[0-9a-f]{10}\.(js|css)$/.test(f)) {
			await rm(path.join(dist, f));
		}
	}

	const js = await esbuild.build({
		entryPoints: ['src/main.jsx'],
		bundle: true,
		minify: true,
		sourcemap: false,
		format: 'iife',
		target: ['es2020'],
		jsx: 'automatic',
		jsxImportSource: 'preact',
		write: false,
		legalComments: 'none',
		define: { 'process.env.NODE_ENV': '"production"' },
	});
	const jsText = js.outputFiles[0].text;

	const css = sass.compile('src/styles/app.scss', { style: 'compressed', loadPaths: ['node_modules'] }).css;

	const jsName = `cv.${hash(jsText)}.js`;
	const cssName = `cv.${hash(css)}.css`;
	await writeFile(path.join(dist, jsName), jsText);
	await writeFile(path.join(dist, cssName), css);
	await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify({ js: jsName, css: cssName }, null, '\t')}\n`);
	console.log(`${jsName} ${(jsText.length / 1024).toFixed(0)} KB, ${cssName} ${(css.length / 1024).toFixed(0)} KB`);
}

await copyFonts();
await buildOnce();

if (watch) {
	const { watch: fsWatch } = await import('node:fs');
	let timer = null;
	fsWatch('src', { recursive: true }, () => {
		clearTimeout(timer);
		timer = setTimeout(() => buildOnce().catch(err => console.error(err.message)), 150);
	});
	console.log('watching src/');
}
