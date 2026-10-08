// Önizleme: blokları gizli bir ölçüm sayfasında ölçer, gerçek A4 sayfalara dağıtır ve çizer.
// Yazdırma aynı sayfaları kullanır; ekranda görünen sayfa sayısı PDF'tekiyle aynıdır.
import { Component } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { buildTemplate } from '../templates/index.jsx';
import { FINE, fontStack, themeMetrics } from '../model.js';
import { A4, layoutColumns } from '../paginate.js';

const COL_GAP = 26;

export function themeStyle(theme) {
	const m = themeMetrics(theme);
	return {
		'--cv-primary': theme.primary,
		'--cv-accent': theme.accent,
		'--cv-font': fontStack(theme.font),
		'--cv-size': `${m.sizePx}px`,
		'--cv-lh': String(m.lineHeight),
		'--cv-gap': `${m.gapPx}px`,
	};
}

// Üst ve alt boşluk en fazla 40 px (NextCV ile aynı): yan boşluk Geniş seçilse de sayfa dikeyde yer kaybetmez
const MARGIN_Y_MAX = 40;

function geometry(theme, columns) {
	const margin = themeMetrics(theme).marginPx;
	const marginY = Math.min(margin, MARGIN_Y_MAX);
	const contentW = A4.width - (2 * margin);
	const widths = {};
	if (columns.length === 1) {
		widths[columns[0].key] = contentW;
	} else {
		const side = Math.round(columns[0].width * contentW);
		widths[columns[0].key] = side;
		widths[columns[1].key] = contentW - side - COL_GAP;
	}
	return { margin, marginY, padding: `${marginY}px ${margin}px`, contentW, contentH: A4.height - (2 * marginY), widths };
}

function Columns({ built, geo, pageCols }) {
	const byKey = {};
	built.columns.forEach((c) => { c.blocks.forEach((b) => { byKey[b.key] = b; }); });
	// Yan sütun ekranda solda durur ama HTML'de (dolayısıyla PDF metninde) ana sütundan sonra gelir:
	// ATS ve ekran okuyucular önce adı, özeti ve deneyimi okur.
	const sideFirst = pageCols.length > 1 && pageCols[0].key === 'side';
	const ordered = sideFirst ? [...pageCols].reverse() : pageCols;
	return (
		<div class={`cv-cols ${sideFirst ? 'cv-cols--rev' : ''}`} style={{ gap: `${COL_GAP}px` }}>
			{ordered.map(col => (
				<div class={`cv-col cv-col--${col.key}`} key={col.key} data-col={col.key} style={{ width: `${geo.widths[col.key]}px` }}>
					{/* Şablon ya da içerik değişince bir an eski sayfa düzeni gelir: artık olmayan blokları atla, ölçüm hemen düzeltir */}
				{col.keys.filter(k => byKey[k]).map(k => <div class="cv-block" key={k} data-block={k}>{byKey[k].render()}</div>)}
				</div>
			))}
		</div>
	);
}

// Gizli ölçüm sayfasındaki blokların yüksekliği (alt boşluk dâhil), sütun sütun
function measure(host, built) {
	return built.columns.map((col) => {
		const el = host.querySelector(`[data-col="${col.key}"]`);
		const heights = {};
		if (el) {
			el.querySelectorAll(':scope > .cv-block').forEach((n) => { heights[n.dataset.block] = n.offsetHeight; });
		}
		return { key: col.key, blocks: col.blocks.map(b => ({ key: b.key, height: heights[b.key] || 0, keepWithNext: !!b.keepWithNext })) };
	});
}

// "Tek sayfaya sığdır": üç adımda, gerektiği kadar küçültür ve yazıyı olabildiğince büyük tutar:
//   1) satır aralığı, bölüm aralığı ve kenar boşluğu rahat alt değere (FINE.soft) iner, yazı aynı kalır;
//   2) yazı rahat alt değere iner;
//   3) hepsi birlikte en sıkı değere (FINE.fit) iner.
// Yol tek yönlü küçüldüğü için ikili arama tek sayfaya sığan en gevşek noktayı bulur. Ölçüm sayfasında dener
// (ekrandaki sayfa değişmez). Döner: { fits, pages, values } ya da ölçülemiyorsa / zaten tek sayfaysa null.
export function fitOnePage(root, profile) {
	const host = root && root.querySelector('.cv-page--measure');
	if (!host || !host.offsetWidth) return null;
	const built = buildTemplate(profile);
	const theme = profile.settings.theme;
	const from = themeMetrics(theme);
	const SPACING = ['lineHeight', 'gapPx', 'marginPx'];
	const lerp = (a, b, k) => a + ((b - a) * Math.min(1, Math.max(0, k)));
	const at = (t) => {
		const values = {};
		Object.keys(FINE).forEach((key) => {
			const { step, soft, fit } = FINE[key];
			const softTo = Math.min(from[key], soft);
			const hardTo = Math.min(softTo, fit);
			const phase = SPACING.includes(key) ? t * 3 : (t * 3) - 1;
			const v = t <= 2 / 3 ? lerp(from[key], softTo, phase) : lerp(softTo, hardTo, (t * 3) - 2);
			const stepped = Math.floor((v / step) + 1e-6) * step;
			values[key] = Math.round(Math.max(hardTo, stepped) * 100) / 100;
		});
		return values;
	};
	const pagesAt = (values) => {
		const tried = { ...theme, ...values };
		const geo = geometry(tried, built.columns);
		Object.entries(themeStyle(tried)).forEach(([name, value]) => host.parentNode.style.setProperty(name, value));
		host.style.padding = geo.padding;
		built.columns.forEach((col) => {
			const el = host.querySelector(`[data-col="${col.key}"]`);
			if (el) el.style.width = `${geo.widths[col.key]}px`;
		});
		return layoutColumns(measure(host, built), geo.contentH).length;
	};
	try {
		if (pagesAt({}) <= 1) return null;
		const tightest = pagesAt(at(1));
		if (tightest > 1) return { fits: false, pages: tightest, values: at(1) };
		let lo = 0;
		let hi = 1;
		for (let i = 0; i < 10; i += 1) {
			const mid = (lo + hi) / 2;
			if (pagesAt(at(mid)) <= 1) hi = mid;
			else lo = mid;
		}
		return { fits: true, pages: 1, values: at(hi) };
	} finally {
		// Ölçüm sayfası eski hâline döner; yeni ayar kaydedilince Preview kendisi çizer
		pagesAt({});
	}
}

// Önizlemede beklenmedik bir hata düzenleyiciyi dondurmasın: mesaj göster, bir sonraki değişiklikte yeniden dene
export class PreviewBoundary extends Component {
	constructor(props) {
		super(props);
		this.state = { error: null };
	}

	componentDidCatch(error) {
		console.error('[cv-yu] preview', error);
		this.setState({ error });
	}

	componentDidUpdate(prev) {
		if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
	}

	render() {
		return this.state.error ? <p class="cv-preview-error" role="alert">{this.props.message}</p> : this.props.children;
	}
}

export function isEmpty(profile) {
	const d = profile.data;
	return !Object.values(d.personal).some(v => v && String(v).trim()) && !d.summary.trim() && !d.hobbies.trim() &&
		!['experience', 'projects', 'education', 'involvement', 'skills', 'certifications', 'languages', 'awards', 'references'].some(k => (d[k] || []).length);
}

export function Preview({ profile, zoom, onLayout, docLang, emptyHint, pageLabels }) {
	const built = useMemo(() => buildTemplate(profile), [profile]);
	const theme = profile.settings.theme;
	const geo = useMemo(() => geometry(theme, built.columns), [theme.margins, theme.marginPx, built]);
	const [pages, setPages] = useState(null);
	const [fontsTick, setFontsTick] = useState(0);
	const measureRef = useRef(null);
	const style = themeStyle(theme);

	// Yazı tipi sonradan gelirse blok yükseklikleri değişir: seçili ailenin kesimlerini açıkça yükle, gelince yeniden ölç
	useEffect(() => {
		if (!document.fonts || !document.fonts.load) return undefined;
		let alive = true;
		const family = fontStack(theme.font).split(',')[0];
		// İtalik burada istenmez: Sade gibi italiksiz CV'de gereksiz dosya inmesin (Harvard'da gerekirse loadingdone yeniden ölçtürür)
		const faces = ['400', '500', '600', '700'].map(w => document.fonts.load(`${w} 13px ${family}`).catch(() => null));
		Promise.all(faces).then(() => { if (alive) setFontsTick(t => t + 1); });
		const onDone = () => { if (alive) setFontsTick(t => t + 1); };
		document.fonts.addEventListener('loadingdone', onDone);
		return () => { alive = false; document.fonts.removeEventListener('loadingdone', onDone); };
	}, [theme.font]);

	// Ölçüm: gizli sayfadaki blokların yüksekliği (alt boşluk dâhil) → sayfalara dağıt
	useLayoutEffect(() => {
		const host = measureRef.current;
		if (!host) return;
		const next = layoutColumns(measure(host, built), geo.contentH);
		setPages(next);
		if (onLayout) onLayout(next.length);
	}, [built, geo, fontsTick, theme.font, theme.size, theme.spacing, theme.sizePx, theme.lineHeight, theme.gapPx, theme.titleStyle, theme.icons, theme.photoShape, theme.photoSize]);

	const scale = zoom === 'fit' ? null : zoom;
	const sideW = built.columns.length > 1 ? geo.margin + geo.widths[built.columns[0].key] + (COL_GAP / 2) : 0;
	const allCols = built.columns.map(c => ({ key: c.key, keys: c.blocks.map(b => b.key) }));

	return (
		<div class={`cv-pages cv-pages--${built.template}`} style={style} lang={docLang} data-scale={scale || ''}>
			{/* Gizli ölçüm sayfası: gerçek sayfalarla aynı genişlik, yazı tipi ve boşluklar */}
			<div class="cv-page cv-page--measure" aria-hidden="true" ref={measureRef} style={{ padding: geo.padding }}>
				<Columns built={built} geo={geo} pageCols={allCols} />
			</div>
			{(pages || [allCols]).map((pageCols, i, all) => (
				<section class={`cv-page cv-page--${built.template}`} key={i} aria-label={pageLabels ? pageLabels.page(i + 1) : `${i + 1}`} style={{ padding: geo.padding }}>
					{sideW ? <div class="cv-side-bg" style={{ width: `${sideW}px` }} aria-hidden="true" /> : null}
					<Columns built={built} geo={geo} pageCols={pageCols} />
					{i === 0 && emptyHint && isEmpty(profile) ? <div class="cv-empty"><strong>{emptyHint[0]}</strong>{emptyHint[1]}</div> : null}
					{/* Birden çok sayfa varsa sayfanın üstünde numarası, altında devam uyarısı (yalnızca ekranda) */}
					{pageLabels && all.length > 1 ? <span class="cv-page-tag" aria-hidden="true">{pageLabels.page(i + 1)} / {all.length}</span> : null}
					{pageLabels && i < all.length - 1 ? <span class="cv-page-cont" aria-hidden="true">{pageLabels.continues(i + 2)}</span> : null}
				</section>
			))}
		</div>
	);
}
