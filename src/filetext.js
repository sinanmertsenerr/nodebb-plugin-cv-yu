// Eski CV dosyasından düz metin: PDF (pdf.js ile, tarayıcıda) ya da .txt. Dosya hiçbir yere yüklenmez.
// Taranmış (resim) PDF'te yazı katmanı yoktur; o zaman boş döner ve kişiye metni elle yapıştırması söylenir.
/* global PDFJS_DIR */

// Betik değerlendirilirken kendi adresi: pdf.js dosyaları onun yanındaki klasördedir
const SCRIPT_URL = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 8;

let pdfjs = null;

async function loadPdfjs() {
	if (pdfjs) return pdfjs;
	const base = new URL(`../${PDFJS_DIR}/`, SCRIPT_URL || window.location.href);
	pdfjs = await import(/* @vite-ignore */ new URL('pdf.min.js', base).href);
	pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.js', base).href;
	return pdfjs;
}

export function isReadable(file) {
	return !!file && (/\.(pdf|txt)$/i.test(file.name) || file.type === 'application/pdf' || file.type === 'text/plain');
}

// pdf.js parçalarını satırlara çevirir. Parçalar arasına her zaman boşluk koymak "Mühendisli ğ i" gibi kırıklar
// yaratıyordu: boşluk yalnızca iki parça arasında gerçekten mesafe varsa konur, satır değişince alt satıra geçilir.
export function joinItems(items) {
	let out = '';
	let lastEnd = null;
	let lastY = null;
	items.forEach((it) => {
		const str = it.str || '';
		const t = it.transform || [1, 0, 0, 1, 0, 0];
		const size = Math.hypot(t[0], t[1]) || it.height || 10;
		if (str) {
			if (lastEnd !== null) {
				if (Math.abs(t[5] - lastY) >= size * 0.5) {
					if (!out.endsWith('\n')) out += '\n';
				} else if (t[4] - lastEnd > size * 0.15 && !/\s$/.test(out)) {
					out += ' ';
				}
			}
			out += str;
			lastEnd = t[4] + (it.width || 0);
			lastY = t[5];
		}
		if (it.hasEOL) {
			if (!out.endsWith('\n')) out += '\n';
			lastEnd = null;
		}
	});
	return out;
}

// getTextContent() akışı "for await" ile okur; Safari'nin motoru bunu desteklemiyor. Akışı kendimiz okuruz.
async function pageItems(page) {
	const reader = page.streamTextContent().getReader();
	const items = [];
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		items.push(...value.items);
	}
	return items;
}

export async function textFromFile(file) {
	if (!isReadable(file)) throw new Error('type');
	if (file.size > MAX_BYTES) throw new Error('size');
	if (file.type === 'text/plain' || /\.txt$/i.test(file.name)) return (await file.text()).trim();
	const lib = await loadPdfjs();
	const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
	const doc = await task.promise;
	try {
		let out = '';
		for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n += 1) {
			out += `${joinItems(await pageItems(await doc.getPage(n)))}\n\n`;
		}
		return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
	} finally {
		// pdf.js 6'da belgeyi yükleme görevi kapatır; eski sürümlerde belgenin kendisi
		if (typeof task.destroy === 'function') task.destroy();
		else if (typeof doc.destroy === 'function') doc.destroy();
	}
}
