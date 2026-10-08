// Yapay zekâ ile doldurma (API yok, anahtar yok, sunucuya bir şey gitmez):
// 1) kişiye hazır bir komut verilir, 2) kişi onu kendi seçtiği yapay zekâya yapıştırır,
// 3) gelen JSON cevabı buraya yapıştırınca CV oluşur. Biçim LIST_SECTIONS'tan üretilir, model değişince komut da değişir.
import { importAny, levelOf } from './import.js';
import { LEVELS, LIST_SECTIONS, defaultSections, normalize, sectionHasContent } from './model.js';

const AI_PERSONAL = ['name', 'title', 'location', 'email', 'phone', 'linkedin', 'github', 'website'];
const AI_SECTIONS = ['experience', 'projects', 'education', 'involvement', 'skills', 'certifications', 'languages', 'awards'];

function exampleItem(type) {
	const item = {};
	LIST_SECTIONS[type].fields.forEach((f) => {
		if (f === 'current') item[f] = false;
		else if (f === 'level') item[f] = LEVELS.join(' | ');
		else if (f === 'start' || f === 'end' || f === 'date') item[f] = 'YYYY-MM';
		else item[f] = '';
	});
	if (LIST_SECTIONS[type].bullets) item.bullets = ['...'];
	return item;
}

export function schemaExample() {
	const out = { personal: {} };
	AI_PERSONAL.forEach((k) => { out.personal[k] = ''; });
	out.summary = '';
	AI_SECTIONS.forEach((type) => { out[type] = [exampleItem(type)]; });
	out.hobbies = '';
	return out;
}

// Mevcut CV'nin komuta girecek hâli: kimlikler, fotoğraf ve görünüm ayarları çıkarılır
export function profileForAI(profile) {
	const d = profile.data;
	const out = { personal: {} };
	AI_PERSONAL.forEach((k) => { out.personal[k] = d.personal[k] || ''; });
	out.summary = d.summary || '';
	AI_SECTIONS.forEach((type) => {
		out[type] = (d[type] || []).map(({ id, ...rest }) => rest);
	});
	out.hobbies = d.hobbies || '';
	return out;
}

const TEXT = {
	tr: {
		role: 'Sen deneyimli bir insan kaynakları uzmanı ve CV yazarısın.',
		taskNew: 'Aşağıdaki bilgilerden Türkçe bir CV hazırla.',
		taskImprove: 'Aşağıdaki CV\'yi iyileştir: yazımı ve dili düzelt, maddeleri güçlendir, gereksiz tekrarları at. Yapıyı ve bilgileri koru, sırayı değiştirme. Dili Türkçe olsun.',
		rules: [
			'Yalnızca verilen bilgileri kullan. Şirket, tarih, sayı, beceri ya da başarı UYDURMA; bilmediğin alanı boş bırak ("").',
			'Her madde güçlü bir eylemle başlasın (geliştirdim, yönettim, azalttım…), mümkünse ölçülebilir sonuç içersin ve en fazla iki satır olsun.',
			'Tarihler "YYYY-MM" biçiminde olsun (ör. "2024-09"). Hâlâ devam eden iş için "current": true ve "end": "" yaz.',
			'Özet 2-4 cümle olsun; birinci tekil şahıs kullan, abartılı sıfatlardan kaçın.',
			'"skills" içinde "items" virgülle ayrılmış tek bir metin olsun. Dil seviyesi şunlardan biri olsun: native, fluent, advanced, intermediate, basic.',
			'Boş kalan bölümü boş dizi ([]) olarak bırak.',
			'Cevap olarak YALNIZCA aşağıdaki biçimde geçerli bir JSON ver. Önüne ya da arkasına açıklama yazma.',
		],
		format: 'Biçim:',
		dataNew: 'Bilgilerim:',
		dataImprove: 'İyileştirilecek CV (JSON):',
	},
	en: {
		role: 'You are an experienced recruiter and CV writer.',
		taskNew: 'Write a CV in English from the information below.',
		taskImprove: 'Improve the CV below: fix grammar and wording, strengthen the bullet points, remove repetition. Keep the structure, the facts and the order. Write in English.',
		rules: [
			'Use only the information given. Do NOT invent companies, dates, numbers, skills or achievements; leave unknown fields empty ("").',
			'Start every bullet with a strong verb (built, led, reduced…), include a measurable result where possible, and keep it to two lines at most.',
			'Write dates as "YYYY-MM" (e.g. "2024-09"). For a role that is still ongoing use "current": true and "end": "".',
			'Keep the summary to 2-4 sentences, first person without pronouns, no buzzwords.',
			'In "skills", "items" is one comma-separated string. Language level is one of: native, fluent, advanced, intermediate, basic.',
			'Leave a section you have nothing for as an empty array ([]).',
			'Reply with ONLY valid JSON in the format below. No explanation before or after it.',
		],
		format: 'Format:',
		dataNew: 'My information:',
		dataImprove: 'CV to improve (JSON):',
	},
};

export function buildPrompt({ mode, lang, text, profile }) {
	const L = TEXT[lang] || TEXT.en;
	const lines = [L.role, mode === 'improve' ? L.taskImprove : L.taskNew, ''];
	L.rules.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
	lines.push('', L.format, JSON.stringify(schemaExample(), null, 2), '');
	if (mode === 'improve') {
		lines.push(L.dataImprove, JSON.stringify(profileForAI(profile), null, 2));
	} else {
		lines.push(L.dataNew, '"""', String(text || '').trim(), '"""');
	}
	return lines.join('\n');
}

// Yapay zekâ cevabındaki JSON'u bulur: ```json bloğu, önde/arkada yazı, akıllı tırnaklar
export function extractJSON(text) {
	let s = String(text || '').replace(/^\uFEFF/, '').trim();
	const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) s = fence[1];
	// Dosyanın tamamı JSON ise (en üstte dizi de olabilir) olduğu gibi okunur
	try {
		const whole = JSON.parse(s);
		if (whole && typeof whole === 'object') return whole;
	} catch (err) { /* önünde ya da arkasında yazı var; aşağıda ayıklanır */ }
	const a = s.indexOf('{');
	const b = s.lastIndexOf('}');
	if (a < 0 || b <= a) throw new Error('no-json');
	const body = s.slice(a, b + 1);
	try {
		return JSON.parse(body);
	} catch (err) {
		// Bazı sohbet arayüzleri anahtar tırnaklarını “ ” yapar
		return JSON.parse(body.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1'));
	}
}

const str = v => (v === null || v === undefined ? '' : String(v)).trim();

function cleanItem(type, raw) {
	const item = {};
	const src = raw && typeof raw === 'object' ? raw : {};
	LIST_SECTIONS[type].fields.forEach((f) => {
		if (f === 'current') item[f] = src[f] === true || src[f] === 'true';
		else if (f === 'level') item[f] = levelOf(src[f]);
		else if (f === 'items' && Array.isArray(src[f])) item[f] = src[f].map(str).filter(Boolean).join(', ');
		else item[f] = str(src[f]);
	});
	if (LIST_SECTIONS[type].bullets) {
		const list = Array.isArray(src.bullets) ? src.bullets : (typeof src.bullets === 'string' ? src.bullets.split(/\n+/) : []);
		item.bullets = list.map(b => str(b).replace(/^[-•*·]\s*/, '')).filter(Boolean);
		if (!item.bullets.length) item.bullets = [''];
	}
	if (item.current) item.end = '';
	return item;
}

// "İçe aktar": bizim dosya, başka bir aracın dışa aktarımı ya da yapay zekâ cevabı; hangi düzende olursa olsun okunur (import.js)
export function readImport(text, lang) {
	return importAny(extractJSON(text), lang);
}

export function profileFromAI(text, { lang, name, base }) {
	const obj = extractJSON(text);
	// Yapıştırılan şey bizim dışa aktarma dosyası ya da başka bir aracın dosyasıysa olduğu gibi al
	if (obj && !obj.personal && !(obj.data && obj.data.personal)) {
		try {
			const list = importAny(obj, lang);
			if (list.length) return list[0];
		} catch (err) { /* aşağıda biçim hatası verilir */ }
	}
	const data0 = obj && obj.data && obj.data.personal ? obj.data : obj;
	if (!data0 || typeof data0 !== 'object' || !data0.personal || typeof data0.personal !== 'object') throw new Error('shape');
	const data = { personal: {}, summary: str(data0.summary), hobbies: str(data0.hobbies) };
	AI_PERSONAL.forEach((k) => { data.personal[k] = str(data0.personal[k]); });
	// İyileştirmede yapay zekâya gönderilmeyen alanlar (fotoğraf, doğum tarihi…) mevcut CV'den korunur
	if (base) data.personal = { ...base.data.personal, ...data.personal };
	Object.keys(LIST_SECTIONS).forEach((type) => {
		const list = Array.isArray(data0[type]) ? data0[type] : [];
		data[type] = type === 'references' && base ? base.data.references : list.map(item => cleanItem(type, item));
	});
	// Görünürlük: iyileştirmede eski sıra ve ayarlar kalır; yeni CV'de yalnız dolu bölümler görünür
	data.sections = base ? base.data.sections : defaultSections().map(s => ({ ...s, visible: sectionHasContent(data, s.type) }));
	const settings = base ? base.settings : { lang };
	return normalize({ name: name || data.personal.name || 'CV', settings, data }, lang);
}

