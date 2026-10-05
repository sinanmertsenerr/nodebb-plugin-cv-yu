// Önizleme: blokları gizli bir ölçüm sayfasında ölçer, gerçek A4 sayfalara dağıtır ve çizer.
// Yazdırma aynı sayfaları kullanır; ekranda görünen sayfa sayısı PDF'tekiyle aynıdır.
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { buildTemplate } from '../templates/index.jsx';
import { A4, MARGINS, layoutColumns } from '../paginate.js';

const FONT_STACK = {
	inter: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
	sans: '"Source Sans 3", "Segoe UI", Roboto, sans-serif',
	serif: '"Source Serif 4", Georgia, "Times New Roman", serif',
};
const SIZE = { s: 12, m: 13, l: 14 };
const LINE = { s: 1.32, m: 1.45, l: 1.58 };
const GAP = { s: 12, m: 16, l: 20 };
const COL_GAP = 26;

export function themeStyle(theme) {
	return {
		'--cv-primary': theme.primary,
		'--cv-accent': theme.accent,
		'--cv-font': FONT_STACK[theme.font] || FONT_STACK.inter,
		'--cv-size': `${SIZE[theme.size] || SIZE.m}px`,
		'--cv-lh': String(LINE[theme.spacing] || LINE.m),
		'--cv-gap': `${GAP[theme.spacing] || GAP.m}px`,
	};
}

function geometry(theme, columns) {
	const margin = MARGINS[theme.margins] || MARGINS.m;
	const contentW = A4.width - (2 * margin);
	const widths = {};
	if (columns.length === 1) {
		widths[columns[0].key] = contentW;
	} else {
		const side = Math.round(columns[0].width * contentW);
		widths[columns[0].key] = side;
		widths[columns[1].key] = contentW - side - COL_GAP;
	}
	return { margin, contentW, contentH: A4.height - (2 * margin), widths };
}

function Columns({ built, geo, pageCols }) {
	const byKey = {};
	built.columns.forEach((c) => { c.blocks.forEach((b) => { byKey[b.key] = b; }); });
	return (
		<div class="cv-cols" style={{ gap: `${COL_GAP}px` }}>
			{pageCols.map(col => (
				<div class={`cv-col cv-col--${col.key}`} key={col.key} data-col={col.key} style={{ width: `${geo.widths[col.key]}px` }}>
					{col.keys.map(k => <div class="cv-block" key={k} data-block={k}>{byKey[k].render()}</div>)}
				</div>
			))}
		</div>
	);
}

function isEmpty(profile) {
	const d = profile.data;
	return !Object.values(d.personal).some(v => v && String(v).trim()) && !d.summary.trim() && !d.hobbies.trim() &&
		!['experience', 'projects', 'education', 'involvement', 'skills', 'certifications', 'languages', 'awards', 'references'].some(k => (d[k] || []).length);
}

export function Preview({ profile, zoom, onLayout, docLang, emptyHint }) {
	const built = useMemo(() => buildTemplate(profile), [profile]);
	const theme = profile.settings.theme;
	const geo = useMemo(() => geometry(theme, built.columns), [theme.margins, built]);
	const [pages, setPages] = useState(null);
	const measureRef = useRef(null);
	const style = themeStyle(theme);

	// Ölçüm: gizli sayfadaki blokların yüksekliği (alt boşluk dâhil) → sayfalara dağıt
	useLayoutEffect(() => {
		const host = measureRef.current;
		if (!host) return;
		const cols = built.columns.map((col) => {
			const el = host.querySelector(`[data-col="${col.key}"]`);
			const heights = {};
			if (el) {
				el.querySelectorAll(':scope > .cv-block').forEach((n) => { heights[n.dataset.block] = n.offsetHeight; });
			}
			return { key: col.key, blocks: col.blocks.map(b => ({ key: b.key, height: heights[b.key] || 0, keepWithNext: !!b.keepWithNext })) };
		});
		const next = layoutColumns(cols, geo.contentH);
		setPages(next);
		if (onLayout) onLayout(next.length);
	}, [built, geo, theme.font, theme.size, theme.spacing, theme.titleStyle, theme.icons, theme.photoShape, theme.photoSize]);

	const scale = zoom === 'fit' ? null : zoom;
	const sideW = built.columns.length > 1 ? geo.margin + geo.widths[built.columns[0].key] + (COL_GAP / 2) : 0;
	const allCols = built.columns.map(c => ({ key: c.key, keys: c.blocks.map(b => b.key) }));

	return (
		<div class={`cv-pages cv-pages--${built.template}`} style={style} lang={docLang} data-scale={scale || ''}>
			{/* Gizli ölçüm sayfası: gerçek sayfalarla aynı genişlik, yazı tipi ve boşluklar */}
			<div class="cv-page cv-page--measure" aria-hidden="true" ref={measureRef} style={{ padding: `${geo.margin}px` }}>
				<Columns built={built} geo={geo} pageCols={allCols} />
			</div>
			{(pages || [allCols]).map((pageCols, i) => (
				<section class={`cv-page cv-page--${built.template}`} key={i} aria-label={`${i + 1}`} style={{ padding: `${geo.margin}px` }}>
					{sideW ? <div class="cv-side-bg" style={{ width: `${sideW}px` }} aria-hidden="true" /> : null}
					<Columns built={built} geo={geo} pageCols={pageCols} />
					{i === 0 && emptyHint && isEmpty(profile) ? <div class="cv-empty"><strong>{emptyHint[0]}</strong>{emptyHint[1]}</div> : null}
				</section>
			))}
		</div>
	);
}
