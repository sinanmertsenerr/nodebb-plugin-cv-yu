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

export const TEMPLATES = ['sade', 'yan', 'sikisik'];
export const LEVELS = ['native', 'fluent', 'advanced', 'intermediate', 'basic'];

export const DEFAULT_THEME = {
	primary: '#1f2a37',
	accent: '#1a5fb4',
	font: 'inter',
	size: 'm',
	spacing: 'm',
	margins: 'm',
	titleStyle: 'caps',
	icons: true,
	photoShape: 'circle',
	photoSize: 'm',
};

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
	const out = {
		id: typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(p.id) ? p.id : base.id,
		name: String(p.name || base.name).slice(0, 80),
		updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : Date.now(),
		settings: {
			template: TEMPLATES.includes(p.settings && p.settings.template) ? p.settings.template : 'sade',
			lang: p.settings && p.settings.lang === 'tr' ? 'tr' : (p.settings && p.settings.lang === 'en' ? 'en' : base.settings.lang),
			theme: { ...DEFAULT_THEME, ...((p.settings && p.settings.theme) || {}) },
		},
		data: { ...base.data },
	};
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

// Başka bir aracın JSON dışa aktarımını (örn. IEU Forum'daki CV aracı) bizim modele çevirir.
// Alan adları kullanıcıya ait veridir; yalnızca eşleme yapılır.
export function importForeign(obj, fallbackLang) {
	const src = obj && obj.state ? obj.state : obj;
	if (!src || typeof src !== 'object' || !src.personalInfo) {
		return null;
	}
	const pi = src.personalInfo || {};
	const sectionMap = { summary: 'summary', experience: 'experience', projects: 'projects', education: 'education', involvement: 'involvement', skills: 'skills', certifications: 'certifications', languages: 'languages', awards: 'awards', hobbies: 'hobbies', references: 'references' };
	const levelMap = { 'Ana Dil': 'native', Native: 'native', 'Akıcı': 'fluent', Fluent: 'fluent', 'İleri': 'advanced', Advanced: 'advanced', Orta: 'intermediate', Intermediate: 'intermediate', Temel: 'basic', Basic: 'basic', Beginner: 'basic' };
	const asList = v => (Array.isArray(v) ? v : []);
	const profile = newProfile(pi.fullName ? `${pi.fullName}` : 'CV', fallbackLang);
	profile.data.personal = {
		...emptyPersonal(),
		name: pi.fullName || '', title: pi.jobTitle || '', location: pi.location || '', email: pi.email || '', phone: pi.phone || '',
		linkedin: pi.linkedin || '', github: pi.github || '', website: pi.website || '', nationality: pi.nationality || '',
		license: pi.drivingLicense || '', birthDate: pi.birthDate || '', photo: typeof pi.profilePhoto === 'string' && pi.profilePhoto.startsWith('data:image/') ? pi.profilePhoto : '',
	};
	profile.data.summary = src.summary || '';
	profile.data.hobbies = src.hobbies || '';
	profile.data.experience = asList(src.experience).map(e => ({ ...emptyItem('experience'), role: e.title || '', company: e.company || '', location: e.location || '', start: e.startDate || '', end: e.endDate || '', current: /present|devam/i.test(e.endDate || ''), bullets: asList(e.bullets).length ? asList(e.bullets) : [''] }));
	profile.data.projects = asList(src.projects).map(e => ({ ...emptyItem('projects'), name: e.name || '', link: e.link || '', start: e.startDate || e.date || '', end: e.endDate || '', bullets: asList(e.bullets).length ? asList(e.bullets) : [''] }));
	profile.data.education = asList(src.education).map(e => ({ ...emptyItem('education'), degree: e.degree || '', school: e.institution || '', location: e.location || '', start: e.startDate || '', end: e.year || e.endDate || '', gpa: e.gpa || '', bullets: asList(e.bullets).length ? asList(e.bullets) : [''] }));
	profile.data.involvement = asList(src.involvement).map(e => ({ ...emptyItem('involvement'), role: e.role || '', org: [e.organization, e.institution].filter(Boolean).join(' · '), start: e.startDate || '', end: e.endDate || '', bullets: asList(e.bullets).length ? asList(e.bullets) : [''] }));
	profile.data.skills = asList(src.skills).map(e => ({ ...emptyItem('skills'), group: e.category || '', items: e.items || '' }));
	profile.data.certifications = asList(src.certifications).map(e => ({ ...emptyItem('certifications'), name: e.name || '', issuer: e.issuer || '', date: e.year || e.date || '', link: e.link || '' }));
	profile.data.languages = asList(src.languages).map(e => ({ ...emptyItem('languages'), name: e.language || e.name || '', level: levelMap[e.proficiency] || levelMap[e.level] || 'intermediate' }));
	profile.data.awards = asList(src.awards).map(e => ({ ...emptyItem('awards'), name: e.title || e.name || '', issuer: e.issuer || '', date: e.year || e.date || '', note: e.description || '' }));
	profile.data.references = asList(src.references).map(e => ({ ...emptyItem('references'), name: e.name || '', title: e.title || e.position || '', company: e.company || '', email: e.email || '', phone: e.phone || '' }));
	const order = asList(src.sections).map(s => ({ type: sectionMap[s.type], visible: s.visible !== false, title: '' })).filter(s => s.type);
	if (order.length) {
		profile.data.sections = order;
	}
	return normalize(profile, fallbackLang);
}

// Dışa aktarma biçimi: tek dosyada birden çok profil
export const EXPORT_FORMAT = 'yu-cv/1';

export function parseImport(text, fallbackLang) {
	const obj = JSON.parse(text);
	if (obj && obj.format === EXPORT_FORMAT && Array.isArray(obj.profiles)) {
		return obj.profiles.map(p => normalize(p, fallbackLang));
	}
	const foreign = importForeign(obj, fallbackLang);
	if (foreign) {
		return [foreign];
	}
	if (obj && obj.data && obj.data.personal) {
		return [normalize(obj, fallbackLang)];
	}
	throw new Error('unknown-format');
}
