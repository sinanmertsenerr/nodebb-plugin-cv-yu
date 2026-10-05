// A4 sayfalama: ölçülmüş blokları sayfalara dağıtır. Saf fonksiyon, DOM bilmez.
// block = { key, height, keepWithNext }  → pages = [[key, …], …]
// Kurallar: bir blok bölünmez; keepWithNext olan blok (bölüm başlığı) tek başına sayfa sonunda kalmaz;
// sayfadan uzun bir blok tek başına bir sayfaya konur ve taşmasına izin verilir.

export const A4 = { width: 794, height: 1123 };
export const MARGINS = { s: 34, m: 46, l: 58 };

export function distribute(blocks, pageHeight) {
	const pages = [];
	let page = [];
	let used = 0;

	const fits = h => used + h <= pageHeight + 0.5;

	for (let i = 0; i < blocks.length; i += 1) {
		const b = blocks[i];
		let need = b.height;
		// Başlık + ilk öğe birlikte sığmalı
		if (b.keepWithNext && blocks[i + 1]) {
			need += blocks[i + 1].height;
		}
		if (!fits(need) && page.length) {
			// Sadece kendisi sığıyorsa ama sonrakiyle sığmıyorsa da sayfayı kapat
			pages.push(page);
			page = [];
			used = 0;
		}
		page.push(b.key);
		used += b.height;
	}
	if (page.length) {
		pages.push(page);
	}
	return pages.length ? pages : [[]];
}

// Birden çok sütun (örn. yan sütun + ana sütun): sayfa sayısı en uzun sütuna göre belirlenir
export function layoutColumns(columns, pageHeight) {
	const perColumn = columns.map(col => distribute(col.blocks, pageHeight));
	const pageCount = Math.max(1, ...perColumn.map(p => p.length));
	return Array.from({ length: pageCount }, (_, i) => columns.map((col, c) => ({ key: col.key, keys: perColumn[c][i] || [] })));
}
