// src/ altındaki uygulamayı static/dist/ altına derler: JS (esbuild, Preact), CSS (sass) ve yazı tipleri.
// Dosya adlarına içerik özeti eklenir; library.js bunları static/dist/manifest.json'dan okur.
import { readFile, writeFile, mkdir, readdir, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as esbuild from 'esbuild';
import subsetFont from 'subset-font';
import * as sass from 'sass';

const watch = process.argv.includes('--watch');
const dist = 'static/dist';
const fontsDir = 'static/fonts';
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 10);

// Kendi sunucumuzdan sunulan yazı tipleri (OFL): latin + latin-ext, normal + italik.
// Küçültülür: ağırlık ekseni CV'nin kullandığı 400–700'e indirilir; latin-ext yalnızca Türkçe ve Avrupa adlarının
// harfleriyle para birimlerini tutar. Aralıklar SCSS'e de buradan yazılır.
const FONT_RANGES = {
	latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
	// Latin Genişletilmiş-A (Türkçe ğ/İ/ş/ı dahil Avrupa harfleri), Azerice Ə/ə, Romence ș/ț, para birimleri (₺, €…).
	// Bunların dışındaki nadir bir harf olursa yalnız o harf sistem yazı tipiyle görünür.
	'latin-ext': 'U+0100-017F, U+018F, U+0192, U+0218-021B, U+0259, U+20A0-20C0',
};
const FONT_WEIGHTS = { min: 400, max: 700 };

function rangeText(ranges) {
	let out = '';
	ranges.split(',').map(r => r.trim().replace(/^U\+/i, '')).forEach((r) => {
		const [a, b] = r.split('-').map(x => parseInt(x, 16));
		for (let c = a; c <= (b || a); c += 1) out += String.fromCodePoint(c);
	});
	return out;
}

// Değişken kesimli aileler; Lato'nun değişkeni yok, onun 400 ve 700 kesimleri ayrı dosya
const FONTS = [
	['inter', '@fontsource-variable/inter'],
	['source-sans-3', '@fontsource-variable/source-sans-3'],
	['source-serif-4', '@fontsource-variable/source-serif-4'],
	['roboto', '@fontsource-variable/roboto'],
	['open-sans', '@fontsource-variable/open-sans'],
	['ibm-plex-sans', '@fontsource-variable/ibm-plex-sans'],
	['merriweather', '@fontsource-variable/merriweather'],
	['lora', '@fontsource-variable/lora'],
	['eb-garamond', '@fontsource-variable/eb-garamond'],
	['playfair-display', '@fontsource-variable/playfair-display'],
	['lato', '@fontsource/lato'],
];
// Yalnız harf aralığı ve aksan yerleşimi kalır. Değişik glif üreten özellikler (locl, calt, liga, tnum, case…) dosyadan
// atılır: Safari'nin PDF'i bu glifleri harfe geri çeviremiyor, ATS ve yapay zekâ metni bozuk okuyordu (tırnaklı
// ailelerde Türkçe locl "i"yi "1" yapıyordu, Inter'de tnum tarihleri "NisSTUTV").
const KEEP_FEATURES = ['kern', 'mark', 'mkmk', 'ccmp'];
const FONT_FILE = /^(.+)-(latin|latin-ext)-(wght|400|700)-(normal|italic)\.woff2$/;

async function copyFonts() {
	await mkdir(fontsDir, { recursive: true });
	for (const [name, pkg] of FONTS) {
		const dir = path.join('node_modules', pkg, 'files');
		const files = (await readdir(dir)).filter(f => FONT_FILE.test(f));
		for (const f of files) {
			const subset = /-latin-ext-/.test(f) ? 'latin-ext' : 'latin';
			const variable = FONT_FILE.exec(f)[3] === 'wght';
			const out = await subsetFont(await readFile(path.join(dir, f)), rangeText(FONT_RANGES[subset]), {
				targetFormat: 'woff2',
				keepFeatures: KEEP_FEATURES,
				...(variable ? { variationAxes: { wght: { ...FONT_WEIGHTS, default: FONT_WEIGHTS.min } } } : {}),
			});
			await writeFile(path.join(fontsDir, f), out);
		}
		await copyFile(path.join('node_modules', pkg, 'LICENSE'), path.join(fontsDir, `LICENSE-${name}.txt`));
	}
}

// PDF'ten metin almak için pdf.js (Apache-2.0). Yalnızca kişi PDF yüklediğinde, kendi tarayıcısında açılır;
// klasör adı sürümü taşır, sürüm değişince 60 günlük önbellek sorun olmaz. .js uzantısı: her sunucu doğru türle sunar.
const pdfjsVersion = JSON.parse(await readFile('node_modules/pdfjs-dist/package.json', 'utf8')).version;
const pdfDir = `pdf-${pdfjsVersion}`;

async function copyPdfjs() {
	for (const f of await readdir('static')) {
		if (/^pdf-[\d.]+$/.test(f) && f !== pdfDir) await rm(path.join('static', f), { recursive: true });
	}
	const out = path.join('static', pdfDir);
	await mkdir(out, { recursive: true });
	const src = 'node_modules/pdfjs-dist/legacy/build';
	await copyFile(path.join(src, 'pdf.min.mjs'), path.join(out, 'pdf.min.js'));
	await copyFile(path.join(src, 'pdf.worker.min.mjs'), path.join(out, 'pdf.worker.min.js'));
	await copyFile('node_modules/pdfjs-dist/LICENSE', path.join(out, 'LICENSE.txt'));
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
		define: { 'process.env.NODE_ENV': '"production"', PDFJS_DIR: JSON.stringify(pdfDir) },
	});
	const jsText = js.outputFiles[0].text;

	const css = sass.compile('src/styles/app.scss', { style: 'compressed', loadPaths: ['node_modules'] }).css;

	const jsName = `cv.${hash(jsText)}.js`;
	const cssName = `cv.${hash(css)}.css`;
	await writeFile(path.join(dist, jsName), jsText);
	await writeFile(path.join(dist, cssName), css);
	await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify({ js: jsName, css: cssName }, null, '\t')}\n`);
	// Yazdırma ve sayfalama testi: NodeBB olmadan açılan sayfa (headless Chrome ile PDF'e basılır)
	const harness = (await readFile('test/harness.template.html', 'utf8')).replace('{{css}}', cssName).replace('{{js}}', jsName);
	await writeFile(path.join(dist, 'harness.html'), harness);
	console.log(`${jsName} ${(jsText.length / 1024).toFixed(0)} KB, ${cssName} ${(css.length / 1024).toFixed(0)} KB`);
}

await copyFonts();
// SCSS'teki unicode-range ve ağırlık aralığı yazı tipleriyle aynı kalsın diye buradan üretilir. $font-version yazı tipi
// dosyalarının özeti: adrese eklenir, dosyalar değişince tarayıcı önbellekteki eskisini kullanmaz.
const fontFiles = (await readdir(fontsDir)).filter(f => f.endsWith('.woff2')).sort();
const fontVersion = hash(Buffer.concat(await Promise.all(fontFiles.map(f => readFile(path.join(fontsDir, f))))));
await writeFile('src/styles/_font-ranges.scss', `// build.mjs üretir, elle değiştirme\n$latin: "${FONT_RANGES.latin}";\n$latin-ext: "${FONT_RANGES['latin-ext']}";\n$font-weights: ${FONT_WEIGHTS.min} ${FONT_WEIGHTS.max};\n$font-version: "${fontVersion}";\n`);
await copyPdfjs();
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
