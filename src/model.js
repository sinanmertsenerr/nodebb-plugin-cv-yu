// Veri modeli: bir profil = ad + ayarlar (şablon, dil, tema) + içerik (kişisel bilgiler ve bölümler).
// Bölüm sırası ve görünürlüğü data.sections dizisinde tutulur; "personal" her zaman en üsttedir.

export const SECTION_TYPES = [
	'summary', 'experience', 'projects', 'education', 'involvement', 'skills',
	'certifications', 'languages', 'awards', 'hobbies', 'references',
];

// Hangi bölüm liste, hangisi düz metin
export const LIST_SECTIONS = {
	experience: { fields: ['role', 'company', 'location', 'start', 'end', 'current'], bullets: true },
	projects: { fields: ['name', 'link', 'start', 'end'], bullets: true },
	education: { fields: ['degree', 'school', 'location', 'start', 'end', 'gpa'], bullets: true },
	involvement: { fields: ['role', 'org', 'start', 'end'], bullets: true },
	skills: { fields: ['group', 'items'], bullets: false },
	certifications: { fields: ['name', 'issuer', 'date', 'link'], bullets: false },
	languages: { fields: ['name', 'level'], bullets: false },
	awards: { fields: ['name', 'issuer', 'date', 'note'], bullets: false },
	references: { fields: ['name', 'title', 'company', 'email', 'phone'], bullets: false },
};

export const TEXT_SECTIONS = ['summary', 'hobbies'];

import { MARGINS } from './paginate.js';

export const TEMPLATES = ['sade', 'harvard', 'yan', 'sikisik'];
export const LEVELS = ['native', 'fluent', 'advanced', 'intermediate', 'basic'];

export const DEFAULT_THEME = {
	primary: '#1f2a37',
	accent: '#1a5fb4',
	font: 'inter',
	size: 'm',
	spacing: 'm',
	gap: 'm',
	margins: 'm',
	titleStyle: 'caps',
	icons: true,
	photo: true,
	photoShape: 'circle',
	photoSize: 'm',
};

// Yazı tipleri (kendi sunucumuzdan). Eski kayıtlar için anahtarlar sabit: inter, sans (Source Sans 3), serif (Source Serif 4)
const SANS_FALLBACK = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';
export const FONTS = [
	{ key: 'inter', family: 'Inter', kind: 'sans' },
	{ key: 'sans', family: 'Source Sans 3', kind: 'sans' },
	{ key: 'roboto', family: 'Roboto', kind: 'sans' },
	{ key: 'open-sans', family: 'Open Sans', kind: 'sans' },
	{ key: 'lato', family: 'Lato', kind: 'sans' },
	{ key: 'plex', family: 'IBM Plex Sans', kind: 'sans' },
	{ key: 'serif', family: 'Source Serif 4', kind: 'serif' },
	{ key: 'merriweather', family: 'Merriweather', kind: 'serif' },
	{ key: 'lora', family: 'Lora', kind: 'serif' },
	{ key: 'garamond', family: 'EB Garamond', kind: 'serif' },
	{ key: 'playfair', family: 'Playfair Display', kind: 'serif' },
];

export function fontStack(key) {
	const f = FONTS.find(x => x.key === key) || FONTS[0];
	return `"${f.family}", ${f.kind === 'serif' ? SERIF_FALLBACK : SANS_FALLBACK}`;
}

// Hazır Küçük/Orta/Büyük seçeneklerinin ölçüleri (px; A4 sayfa 794 px genişliğinde, 1 px = 0,75 pt)
// Orta: 12 px = 9 pt gövde, 1,5 satır aralığı (NextCV'nin oranları, okunur alt sınırın üstünde)
export const SIZE = { s: 11, m: 12, l: 13 };
export const LINE = { s: 1.32, m: 1.5, l: 1.65 };
export const GAP = { s: 12, m: 16, l: 20 };

// İnce ayar: temada bu alanlardan biri doluysa hazır seçeneğin yerine geçer.
// fit = "Tek sayfaya sığdır"ın inebileceği en sıkı değer; altı elle seçilebilir ama okunması zorlaşır.
export const FINE = {
	sizePx: { min: 8.5, max: 16, step: 0.25, fit: 9.5 },
	lineHeight: { min: 1.05, max: 1.9, step: 0.01, fit: 1.15 },
	gapPx: { min: 0, max: 28, step: 1, fit: 3 },
	marginPx: { min: 14, max: 90, step: 2, fit: 20 },
};

// Sayfayı çizen ölçüler: ince ayar varsa o, yoksa hazır seçenek
export function themeMetrics(theme) {
	const pick = (key, preset) => (Number.isFinite(theme[key]) ? theme[key] : preset);
	return {
		sizePx: pick('sizePx', SIZE[theme.size] || SIZE.m),
		lineHeight: pick('lineHeight', LINE[theme.spacing] || LINE.m),
		gapPx: pick('gapPx', GAP[theme.gap] || GAP.m),
		marginPx: pick('marginPx', MARGINS[theme.margins] || MARGINS.m),
	};
}

// Şablonun kendi görünümü. Harvard siyah-beyaz ve tırnaklı yazı tipiyle gelir, diğerleri renkli.
// Harvard'a girip çıkarken uygulanır; diğer şablonlar arasında geçişte kişinin ayarları korunur.
export const TEMPLATE_LOOK = {
	harvard: { font: 'serif', primary: '#111111', accent: '#111111', icons: false },
	sade: { font: DEFAULT_THEME.font, primary: DEFAULT_THEME.primary, accent: DEFAULT_THEME.accent, icons: true },
	yan: { font: DEFAULT_THEME.font, primary: DEFAULT_THEME.primary, accent: DEFAULT_THEME.accent, icons: true },
	sikisik: { font: DEFAULT_THEME.font, primary: DEFAULT_THEME.primary, accent: DEFAULT_THEME.accent, icons: true },
};

export function switchTemplate(settings, next) {
	const crossing = (settings.template === 'harvard') !== (next === 'harvard');
	return { ...settings, template: next, theme: crossing ? { ...settings.theme, ...TEMPLATE_LOOK[next] } : settings.theme };
}

export const PALETTE = [
	{ primary: '#1f2a37', accent: '#1a5fb4' },
	{ primary: '#111827', accent: '#0f766e' },
	{ primary: '#1c1917', accent: '#b45309' },
	{ primary: '#0f172a', accent: '#7c3aed' },
	{ primary: '#14532d', accent: '#15803d' },
	{ primary: '#450a0a', accent: '#b91c1c' },
	{ primary: '#000000', accent: '#000000' },
];

let seq = 0;
export function uid() {
	seq += 1;
	return `${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultSections() {
	return SECTION_TYPES.map(type => ({ type, visible: !['awards', 'references', 'hobbies'].includes(type), title: '' }));
}

export function emptyPersonal() {
	return {
		name: '', title: '', location: '', email: '', phone: '', linkedin: '', github: '', website: '',
		nationality: '', license: '', birthDate: '', photo: '',
	};
}

export function emptyItem(type) {
	const def = LIST_SECTIONS[type];
	const item = { id: uid() };
	def.fields.forEach((f) => { item[f] = f === 'current' ? false : ''; });
	if (def.bullets) {
		item.bullets = [''];
	}
	return item;
}

export function newProfile(name, lang) {
	const data = { personal: emptyPersonal(), summary: '', hobbies: '', sections: defaultSections() };
	Object.keys(LIST_SECTIONS).forEach((type) => { data[type] = []; });
	return {
		id: uid(),
		name,
		updatedAt: Date.now(),
		settings: { template: 'sade', lang: lang === 'tr' ? 'tr' : 'en', theme: { ...DEFAULT_THEME } },
		data,
	};
}

// Eksik alanları tamamlar: eski kayıtlar, içe aktarılan dosyalar ve sürüm geçişleri için
export function normalize(profile, fallbackLang) {
	const base = newProfile(profile && profile.name ? profile.name : 'CV', fallbackLang);
	const p = profile && typeof profile === 'object' ? profile : {};
	// Bilinmeyen şablon Sade'ye döner
	const rawTemplate = p.settings && p.settings.template;
	const template = TEMPLATES.includes(rawTemplate) ? rawTemplate : 'sade';
	const out = {
		id: typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(p.id) ? p.id : base.id,
		name: String(p.name || base.name).slice(0, 80),
		updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : Date.now(),
		settings: {
			template,
			lang: p.settings && p.settings.lang === 'tr' ? 'tr' : (p.settings && p.settings.lang === 'en' ? 'en' : base.settings.lang),
			theme: { ...DEFAULT_THEME, ...(template === 'harvard' ? TEMPLATE_LOOK.harvard : {}), ...((p.settings && p.settings.theme) || {}) },
		},
		data: { ...base.data },
	};
	// İnce ayar yalnız sınırların içindeki sayı olabilir; değilse hazır seçeneğe dönülür
	Object.keys(FINE).forEach((key) => {
		const v = out.settings.theme[key];
		if (Number.isFinite(v)) out.settings.theme[key] = Math.min(FINE[key].max, Math.max(FINE[key].min, v));
		else delete out.settings.theme[key];
	});
	const d = p.data || {};
	out.data.personal = { ...emptyPersonal(), ...(d.personal || {}) };
	out.data.summary = typeof d.summary === 'string' ? d.summary : '';
	out.data.hobbies = typeof d.hobbies === 'string' ? d.hobbies : '';
	Object.keys(LIST_SECTIONS).forEach((type) => {
		const list = Array.isArray(d[type]) ? d[type] : [];
		out.data[type] = list.map(item => ({ ...emptyItem(type), ...item, id: item && item.id ? String(item.id) : uid() }));
	});
	const seen = new Set();
	const sections = (Array.isArray(d.sections) ? d.sections : []).filter(s => s && SECTION_TYPES.includes(s.type) && !seen.has(s.type) && seen.add(s.type))
		.map(s => ({ type: s.type, visible: s.visible !== false, title: typeof s.title === 'string' ? s.title : '' }));
	defaultSections().forEach((s) => { if (!seen.has(s.type)) sections.push(s); });
	out.data.sections = sections;
	return out;
}

// Bir bölümde gösterilecek içerik var mı (boş bölümler CV'de görünmez)
export function sectionHasContent(data, type) {
	if (TEXT_SECTIONS.includes(type)) {
		return !!(data[type] && data[type].trim());
	}
	const list = data[type] || [];
	return list.some(item => Object.keys(item).some(k => k !== 'id' && k !== 'current' && (Array.isArray(item[k]) ? item[k].some(b => b && b.trim()) : (typeof item[k] === 'string' && item[k].trim()))));
}

// Dışa aktarma biçimi: tek dosyada birden çok profil
export const EXPORT_FORMAT = 'yu-cv/1';
