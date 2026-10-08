// Global içe aktarma: hangi araçtan gelirse gelsin bir CV JSON'unu bizim modele çevirir.
// Tanınanlar: bizim dışa aktarma dosyası, NextCV (cvData), JSON Resume (basics/work), Reactive Resume
// (sections.x.items), yapay zekâ cevabı ve aynı bilgiyi başka adlarla tutan düzenler.
// Alan adları karşılaştırılırken küçük harfe çevrilir, Türkçe harfler ve ayraçlar atılır: "Full_Name" = "fullName".
import { doc } from './i18n.js';
import { EXPORT_FORMAT, FONTS, LEVELS, LIST_SECTIONS, SECTION_TYPES, TEXT_SECTIONS, emptyItem, emptyPersonal, newProfile, normalize, sectionHasContent } from './model.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const uniq = list => list.filter((v, i) => v && list.indexOf(v) === i);

export function fold(s) {
	return String(s).toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
}

// Nesnenin alanları, sadeleştirilmiş adlarıyla (ilk gelen kazanır)
function keysOf(obj) {
	const map = new Map();
	if (isObj(obj)) {
		Object.keys(obj).forEach((key) => {
			const f = fold(key);
			if (f && !map.has(f)) map.set(f, obj[key]);
		});
	}
	return map;
}

const blank = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);

// Verilen adlardan dolu olan ilk alan. used verilirse bir alan iki ayrı yere yazılmaz.
function pick(map, aliases, used) {
	for (const a of aliases) {
		if (map.has(a) && !(used && used.has(a)) && !blank(map.get(a))) {
			if (used) used.add(a);
			return map.get(a);
		}
	}
	return undefined;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', '#39': '\'' };

// Bazı araçlar metni HTML olarak saklar (<p>, <ul><li>); düz metne çevrilir
function plain(s) {
	let out = s;
	if (/<\/?[a-z][^>]*>/i.test(out)) {
		out = out.replace(/<\s*br\s*\/?>|<\/\s*(p|li|div|h[1-6])\s*>/gi, '\n').replace(/<[^>]+>/g, '')
			.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m, name) => ENTITIES[name]);
	}
	return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const TEXT_KEYS = ['href', 'url', 'link', 'value', 'text', 'content', 'name', 'label', 'title'];

function text(v) {
	if (typeof v === 'string') return plain(v);
	if (typeof v === 'number' && Number.isFinite(v)) return String(v);
	if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
	if (isObj(v)) return text(pick(keysOf(v), TEXT_KEYS));
	return '';
}

// Madde listesi: dizi ya da çok satırlı metin; baştaki madde işaretleri atılır
function lines(v) {
	if (Array.isArray(v)) return v.flatMap(lines);
	return text(v).split(/\n+/).map(s => s.replace(/^\s*(?:[•·▪◦●]\s*|[-*–]\s+)/, '').trim()).filter(Boolean);
}

const MONTH_NAMES = [
	['january', 'ocak'], ['february', 'subat'], ['march', 'mart'], ['april', 'nisan'], ['may', 'mayis'], ['june', 'haziran'],
	['july', 'temmuz'], ['august', 'agustos'], ['september', 'eylul'], ['october', 'ekim'], ['november', 'kasim'], ['december', 'aralik'],
];

function monthNo(value) {
	const s = String(value).trim();
	if (/^\d{1,2}$/.test(s)) {
		const n = parseInt(s, 10);
		return n >= 1 && n <= 12 ? n : 0;
	}
	const w = fold(s);
	return w.length < 3 ? 0 : MONTH_NAMES.findIndex(names => names.some(n => n.startsWith(w))) + 1;
}

const ym = (year, month) => (month ? `${year}-${String(month).padStart(2, '0')}` : String(year));

// Tarihi bizim biçime (YYYY-AA) çevirir; çevrilemeyen serbest metin ("Yaz 2023") olduğu gibi kalır
export function dateOf(value) {
	let v = value;
	if (isObj(v)) {
		const k = keysOf(v);
		const year = text(pick(k, ['year', 'yil']));
		return /^\d{4}$/.test(year) ? ym(year, monthNo(text(pick(k, ['month', 'ay'])))) : text(v);
	}
	if (typeof v === 'number' && v > 1e11) v = new Date(v).toISOString();
	const s = text(v);
	const iso = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?(?:[T ].*)?$/);
	if (iso && monthNo(iso[2])) return ym(iso[1], monthNo(iso[2]));
	const my = s.match(/^(\d{1,2})[-/.](\d{4})$/);
	if (my && monthNo(my[1])) return ym(my[2], monthNo(my[1]));
	const named = s.match(/^([^\d\s.,]+)[.,]?\s+(\d{4})$/);
	if (named && monthNo(named[1])) return ym(named[2], monthNo(named[1]));
	return s;
}

const PRESENT = /^(present|current|currently|now|ongoing|today|tilldate|devam|devamediyor|halen|hala|gunumuz|suan|simdi)$/;
const isPresent = s => PRESENT.test(fold(s));

function splitRange(s) {
	const years = s.match(/^(\d{4})\s*-\s*(\d{4})$/);
	if (years) return [years[1], years[2]];
	const parts = s.split(/\s+[-–—]\s+|\s*[–—]\s*|\s+(?:to|until)\s+/i);
	return parts.length === 2 ? parts : [s, ''];
}

const START = ['startdate', 'start', 'from', 'since', 'begin', 'startyear', 'datefrom', 'baslangic', 'baslangictarihi'];
const END = ['enddate', 'end', 'to', 'until', 'finish', 'endyear', 'dateto', 'bitis', 'bitistarihi'];
const GRADUATION = ['year', 'graduationyear', 'graduationdate', 'graduation', 'graduated', 'mezuniyet', 'mezuniyetyili'];
const RANGE = ['date', 'dates', 'period', 'duration', 'daterange', 'years', 'time', 'timeperiod', 'year', 'tarih', 'donem'];
const CURRENT = ['current', 'iscurrent', 'present', 'ongoing', 'currentlyworking', 'stillworking', 'devamediyor'];
const DATE = ['date', 'year', 'issuedate', 'issued', 'issuedon', 'releasedate', 'completiondate', 'awarded', 'tarih', 'yil', 'enddate', 'startdate'];

// Başlangıç ve bitiş: ayrı alanlar, tek bir aralık metni ("Oca 2024 - Devam") ya da { start, end } nesnesi
function rangeOf(k, type) {
	let start = pick(k, START);
	let end = pick(k, type === 'education' ? [...END, ...GRADUATION] : END);
	if (blank(start) && blank(end)) {
		const whole = pick(k, RANGE);
		if (isObj(whole) && !keysOf(whole).has('year')) {
			return rangeOf(keysOf(whole), type);
		}
		[start, end] = typeof whole === 'string' ? splitRange(whole.trim()) : [whole, ''];
	}
	const flag = pick(k, CURRENT);
	const current = flag === true || flag === 'true' || isPresent(text(end));
	return { start: isPresent(text(start)) ? '' : dateOf(start), end: current ? '' : dateOf(end), current };
}

const LOCATION = ['location', 'konum', 'yer'];

function cityOf(k) {
	return uniq([pick(k, ['city', 'town', 'sehir', 'il']), pick(k, ['region', 'state', 'province', 'bolge']), pick(k, ['country', 'countryname', 'countrycode', 'ulke'])].map(text)).join(', ');
}

function place(v) {
	if (!isObj(v)) return text(v);
	const k = keysOf(v);
	return cityOf(k) || text(pick(k, ['address', 'formatted', ...TEXT_KEYS]));
}

// Konum: "location" alanı (metin ya da nesne), yoksa ayrı duran şehir/ülke, o da yoksa adres
function placeIn(k) {
	return place(pick(k, LOCATION)) || cityOf(k) || text(pick(k, ['address', 'adres']));
}

export function levelOf(v) {
	if (typeof v === 'number') {
		// 1-5 arası puan (Reactive Resume)
		return v >= 5 ? 'fluent' : (v >= 4 ? 'advanced' : (v >= 3 ? 'intermediate' : 'basic'));
	}
	const s = fold(text(v));
	if (LEVELS.includes(s)) return s;
	if (/anadil|native|bilingual|mothertongue/.test(s)) return 'native';
	if (/akici|fluent|fullprofessional|proficient|c2/.test(s)) return 'fluent';
	if (/ileri|advanced|professionalworking|c1/.test(s)) return 'advanced';
	if (/temel|baslangic|basic|beginner|elementary|a1|a2/.test(s)) return 'basic';
	return 'intermediate';
}

// Bölümün dosyada geçebileceği adlar
const SECTION_KEYS = {
	summary: ['summary', 'objective', 'professionalsummary', 'profilesummary', 'careerobjective', 'aboutme', 'about', 'profile', 'bio', 'ozet', 'hakkimda', 'onyazi'],
	experience: ['experience', 'experiences', 'work', 'workexperience', 'workexperiences', 'workhistory', 'employment', 'employmenthistory', 'professionalexperience', 'jobs', 'positions', 'career', 'deneyim', 'deneyimler', 'isdeneyimi', 'isdeneyimleri'],
	projects: ['projects', 'project', 'personalprojects', 'projeler'],
	education: ['education', 'educations', 'academic', 'academics', 'schools', 'egitim', 'egitimler', 'egitimbilgileri'],
	involvement: ['involvement', 'involvements', 'volunteer', 'volunteering', 'volunteerexperience', 'activities', 'extracurricular', 'extracurriculars', 'extracurricularactivities', 'leadership', 'organizations', 'memberships', 'gonulluluk', 'etkinlikler', 'faaliyetler', 'topluluklar'],
	skills: ['skills', 'skill', 'technicalskills', 'skillset', 'competencies', 'technologies', 'beceriler', 'yetenekler', 'yetkinlikler'],
	certifications: ['certifications', 'certificates', 'certification', 'certificate', 'licenses', 'licensesandcertifications', 'courses', 'trainings', 'training', 'sertifikalar', 'kurslar'],
	languages: ['languages', 'spokenlanguages', 'foreignlanguages', 'diller', 'yabancidiller', 'yabancidil'],
	awards: ['awards', 'honors', 'honours', 'achievements', 'honorsandawards', 'awardsandhonors', 'oduller', 'basarilar'],
	hobbies: ['hobbies', 'interests', 'hobbiesandinterests', 'hobiler', 'ilgialanlari'],
	references: ['references', 'referees', 'referanslar'],
};
const PUBLICATIONS = ['publications', 'yayinlar'];

// Kişisel bilgilerin durduğu kutular ve alan adları
const PERSON_BOXES = ['personalinfo', 'personal', 'basics', 'personaldetails', 'personalinformation', 'personaldata', 'contact', 'contactinfo', 'contactinformation', 'contactdetails', 'header', 'profile', 'about', 'info', 'candidate', 'person', 'kisisel', 'kisiselbilgiler', 'iletisim'];
const LINK_BOXES = ['social', 'socials', 'sociallinks', 'socialmedia', 'links', 'profiles'];
const PERSON = {
	name: ['fullname', 'name', 'adsoyad', 'isim', 'ad'],
	title: ['jobtitle', 'title', 'label', 'headline', 'position', 'role', 'occupation', 'profession', 'designation', 'unvan', 'meslek'],
	email: ['email', 'emailaddress', 'mail', 'eposta'],
	phone: ['phone', 'phonenumber', 'mobile', 'mobilephone', 'telephone', 'cellphone', 'tel', 'telefon'],
	linkedin: ['linkedin', 'linkedinurl'],
	github: ['github', 'githuburl'],
	website: ['website', 'url', 'portfolio', 'homepage', 'web', 'site', 'blog'],
	nationality: ['nationality', 'citizenship', 'uyruk'],
	license: ['drivinglicense', 'driverslicense', 'driverlicense', 'license', 'ehliyet'],
	birthDate: ['birthdate', 'dateofbirth', 'birthday', 'dob', 'dogumtarihi'],
};
const FIRST_NAME = ['firstname', 'givenname', 'first'];
const LAST_NAME = ['lastname', 'surname', 'familyname', 'last', 'soyad'];
const PHOTO = ['profilephoto', 'photo', 'image', 'picture', 'avatar', 'photourl', 'fotograf'];
// Hesaba kaydın kabul ettiği fotoğraf (lib/store.js): gömülü JPEG/PNG/WebP, en fazla 220 KB
const PHOTO_OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const PHOTO_MAX = 220 * 1024;

// Liste bölümlerinde alanların dosyada geçebileceği adlar. Sıra önemli: bir ad birden çok alana uyuyorsa
// (JSON Resume'de "name" şirkettir, başka araçlarda pozisyon) önce yazılan alan onu alır.
const FIELDS = {
	experience: [
		['company', ['company', 'companyname', 'employer', 'organization', 'organisation', 'institution', 'workplace', 'sirket', 'kurum', 'isyeri', 'name']],
		['role', ['role', 'position', 'title', 'jobtitle', 'designation', 'pozisyon', 'unvan', 'gorev', 'name']],
		['location', LOCATION],
	],
	projects: [
		['name', ['name', 'title', 'projectname', 'project', 'ad', 'baslik']],
		['link', ['link', 'url', 'website', 'repository', 'repo', 'github', 'demo', 'source', 'href']],
	],
	education: [
		['school', ['school', 'institution', 'university', 'college', 'schoolname', 'universityname', 'okul', 'universite', 'kurum', 'name']],
		['degree', ['degree', 'studytype', 'qualification', 'program', 'diploma', 'derece', 'title', 'name']],
		['location', LOCATION],
		['gpa', ['gpa', 'score', 'grade', 'cgpa', 'average', 'ortalama']],
	],
	involvement: [
		['org', ['org', 'organization', 'organisation', 'company', 'club', 'community', 'society', 'kulup', 'topluluk', 'name']],
		['role', ['role', 'position', 'title', 'gorev', 'name']],
	],
	certifications: [
		['name', ['name', 'title', 'certificate', 'certification', 'course', 'ad']],
		['issuer', ['issuer', 'authority', 'issuedby', 'provider', 'organization', 'institution', 'veren', 'kurum']],
		['link', ['link', 'url', 'credentialurl', 'certificateurl', 'website', 'href']],
	],
	awards: [
		['name', ['name', 'title', 'award', 'ad']],
		['issuer', ['issuer', 'awarder', 'publisher', 'organization', 'institution', 'veren', 'kurum']],
		['note', ['note', 'description', 'summary', 'details', 'aciklama']],
	],
	references: [
		['name', ['name', 'fullname', 'adsoyad', 'ad']],
		['title', ['title', 'position', 'jobtitle', 'role', 'relationship', 'unvan', 'description']],
		['company', ['company', 'organization', 'organisation', 'employer', 'sirket', 'kurum']],
		['email', PERSON.email],
		['phone', PERSON.phone],
	],
};
const BULLETS = ['summary', 'description', 'details', 'aciklama', 'bullets', 'highlights', 'responsibilities', 'achievements', 'accomplishments', 'duties', 'tasks', 'maddeler'];
const KEYWORDS = ['keywords', 'technologies', 'tech', 'techstack', 'stack', 'tools', 'teknolojiler'];
const STUDY_AREA = ['area', 'fieldofstudy', 'field', 'major', 'department', 'bolum', 'alan'];
const HOST = ['institution', 'school', 'university', 'okul', 'universite'];
const ITEM_BOXES = ['items', 'list', 'entries', 'records', 'values', 'data'];

// Bölüm değeri: düz dizi ya da { items: [...], visible } kutusu (Reactive Resume)
function unbox(value) {
	if (!isObj(value)) return { list: value, visible: true };
	const k = keysOf(value);
	const boxed = ITEM_BOXES.map(a => k.get(a)).find(Array.isArray);
	return { list: boxed || value, visible: k.get('visible') !== false && k.get('hidden') !== true };
}

function listItem(type, raw, lang) {
	const item = emptyItem(type);
	const fields = FIELDS[type];
	if (!isObj(raw)) {
		// Yalnız metin verilmişse öğenin adı sayılır
		const main = type === 'experience' || type === 'involvement' ? 'role' : (type === 'education' ? 'degree' : 'name');
		item[main] = text(raw);
		return item;
	}
	const k = keysOf(raw);
	const used = new Set();
	fields.forEach(([field, aliases]) => {
		item[field] = field === 'location' ? placeIn(k) : text(pick(k, aliases, used));
	});
	if (type === 'education') {
		const area = text(pick(k, STUDY_AREA));
		item.degree = uniq([item.degree, area]).join(', ');
	}
	if (type === 'involvement') {
		item.org = uniq([item.org, text(pick(k, HOST))]).join(' · ');
	}
	const def = LIST_SECTIONS[type];
	if (def.fields.includes('start')) {
		const range = rangeOf(k, type);
		item.start = range.start;
		// "current" alanı olmayan bölümlerde devam eden iş, bitiş yerine CV dilinde yazılır
		item.end = range.current && !def.fields.includes('current') ? doc(lang).present : range.end;
		if (def.fields.includes('current')) item.current = range.current;
	} else if (def.fields.includes('date')) {
		item.date = dateOf(pick(k, DATE));
	}
	if (def.bullets) {
		const all = BULLETS.flatMap(a => lines(k.get(a)));
		const keywords = type === 'projects' ? text(pick(k, KEYWORDS)) : '';
		item.bullets = uniq([...all, keywords]);
		if (!item.bullets.length) item.bullets = [''];
	}
	return item;
}

const SKILL_ITEMS = ['items', 'keywords', 'skills', 'list', 'values', 'technologies', 'tools'];
const SKILL_GROUP = ['group', 'category', 'type', 'kategori', 'grup'];

// Beceriler: "a, b" metni, ad dizisi, { grup: [..] } eşlemesi, { category, items } ya da tek tek { name, level } olabilir
function skillsOf(value) {
	const group = (name, items) => ({ ...emptyItem('skills'), group: name, items });
	if (typeof value === 'string') return [group('', plain(value))];
	if (isObj(value)) {
		return Object.keys(value).map(key => group(key, text(value[key]))).filter(g => g.items);
	}
	const out = [];
	const loose = new Map();
	(Array.isArray(value) ? value : []).forEach((raw) => {
		const k = keysOf(raw);
		const items = text(pick(k, SKILL_ITEMS));
		const name = isObj(raw) ? text(pick(k, ['name', 'title', 'label', 'skill', 'ad'])) : text(raw);
		const cat = text(pick(k, SKILL_GROUP));
		if (items) {
			out.push(group(cat || name, items));
		} else if (name) {
			// Tek tek yazılmış beceriler kendi grubunda toplanır
			loose.set(cat, [...(loose.get(cat) || []), name]);
		}
	});
	loose.forEach((names, cat) => out.push(group(cat, uniq(names).join(', '))));
	return out;
}

function languagesOf(value) {
	const list = typeof value === 'string' ? value.split(/[,;\n]+/) : (Array.isArray(value) ? value : []);
	return list.map((raw) => {
		const item = emptyItem('languages');
		if (isObj(raw)) {
			const k = keysOf(raw);
			item.name = text(pick(k, ['language', 'name', 'lang', 'title', 'dil']));
			// Seviye yazıyla ya da 1-5 puanla gelir; yazı varsa o geçerli
			const levels = ['proficiency', 'fluency', 'level', 'seviye', 'description'].map(a => k.get(a));
			const level = levels.find(v => typeof v === 'string' && v.trim()) || levels.find(v => typeof v === 'number' && v > 0);
			item.level = levelOf(level === undefined ? '' : level);
		} else {
			// "İngilizce (C1)" ya da "İngilizce - İleri"
			const m = text(raw).match(/^(.*?)\s*(?:\((.+)\)|\s[-–:]\s+(.+))?$/);
			item.name = m[1].trim();
			item.level = levelOf(m[2] || m[3] || '');
		}
		return item;
	}).filter(item => item.name);
}

// Hobiler düz metindir: "Fotoğraf, Doğa yürüyüşü"; anahtar kelimeli öğe "Müzik (gitar, piyano)" olur
function hobbiesOf(value) {
	if (!Array.isArray(value)) return text(value);
	return value.map((raw) => {
		const k = keysOf(raw);
		const words = text(pick(k, ['keywords', 'items', 'details']));
		const name = isObj(raw) ? text(pick(k, ['name', 'title', 'label', 'ad'])) : text(raw);
		return name && words ? `${name} (${words})` : (name || words);
	}).filter(Boolean).join(', ');
}

// Özet düz metin, paragraf dizisi ya da { content } kutusu olabilir. Aynı adı taşıyan kişisel kutu
// ("profile": { name, email }) özet sayılmaz.
function proseOf(v) {
	if (Array.isArray(v)) return v.map(proseOf).filter(Boolean).join('\n');
	return isObj(v) ? text(pick(keysOf(v), ['content', 'text', 'value', 'summary', 'description', 'body'])) : text(v);
}

function personOf(boxes, linkLists) {
	const out = emptyPersonal();
	const get = aliases => boxes.reduce((found, k) => (found === undefined ? pick(k, aliases) : found), undefined);
	Object.keys(PERSON).forEach((field) => { out[field] = text(get(PERSON[field])); });
	if (!out.name) out.name = uniq([text(get(FIRST_NAME)), text(get(LAST_NAME))]).join(' ');
	out.birthDate = out.birthDate.replace(/^(\d{4}-\d{2}-\d{2})T.*$/, '$1');
	out.location = boxes.map(placeIn).find(Boolean) || '';
	const photo = text(get(PHOTO));
	out.photo = PHOTO_OK.test(photo) && photo.length <= PHOTO_MAX ? photo : '';
	// Sosyal hesap listesi: [{ network: "LinkedIn", url, username }]
	linkLists.flat().forEach((raw) => {
		const k = keysOf(raw);
		const address = text(pick(k, ['url', 'href', 'link', 'value', 'username', 'handle']));
		const network = fold(text(pick(k, ['network', 'platform', 'name', 'label', 'type', 'site'])) || address);
		const field = network.includes('linkedin') ? 'linkedin' : (network.includes('github') ? 'github' : 'website');
		if (address && !out[field]) out[field] = address;
	});
	return out;
}

// NextCV görünüm ayarlarının bizdeki karşılıkları
const NEXTCV_TEMPLATES = { classic: 'sade', minimalist: 'sade', creative: 'sade', compact: 'sikisik', modern: 'yan', twoColumn: 'yan', academic: 'yan' };
const NEXTCV_SCALE = { small: 's', compact: 's', narrow: 's', sm: 's', medium: 'm', normal: 'm', md: 'm', large: 'l', relaxed: 'l', wide: 'l', lg: 'l' };
const NEXTCV_COLORS = { primaryColor: '#1a1a2e', accentColor: '#4a6cf7' };

function settingsOf(wrapper, lang) {
	const settings = { lang };
	const app = isObj(wrapper) && isObj(wrapper.appSettings) ? wrapper.appSettings : null;
	if (!app) return settings;
	settings.template = NEXTCV_TEMPLATES[app.template] || 'sade';
	const src = isObj(app.theme) ? app.theme : {};
	const theme = {};
	// Renkler yalnız kişi NextCV'de değiştirdiyse taşınır; dokunulmamışsa bizim varsayılan kalır
	const hex = key => (typeof src[key] === 'string' && /^#[0-9a-f]{6}$/i.test(src[key]) && src[key].toLowerCase() !== NEXTCV_COLORS[key] ? src[key].toLowerCase() : '');
	if (hex('primaryColor') || hex('accentColor')) {
		theme.primary = hex('primaryColor') || NEXTCV_COLORS.primaryColor;
		theme.accent = hex('accentColor') || NEXTCV_COLORS.accentColor;
	}
	// Aynı aile bizde varsa o; yoksa türüne göre Source Serif ya da Source Sans
	if (typeof src.fontFamily === 'string' && fold(src.fontFamily) !== 'inter') {
		const same = FONTS.find(f => fold(f.family) === fold(src.fontFamily));
		theme.font = same ? same.key : (/serif|georgia|garamond|times|baskerville/i.test(src.fontFamily) && !/sans/i.test(src.fontFamily) ? 'serif' : 'sans');
	}
	[['size', 'fontSize'], ['spacing', 'lineSpacing'], ['margins', 'pageMargins'], ['photoSize', 'photoSize']].forEach(([ours, theirs]) => {
		if (NEXTCV_SCALE[src[theirs]]) theme[ours] = NEXTCV_SCALE[src[theirs]];
	});
	if (typeof src.sectionTitleStyle === 'string') theme.titleStyle = src.sectionTitleStyle === 'uppercase' ? 'caps' : 'normal';
	if (typeof src.showIcons === 'boolean') theme.icons = src.showIcons;
	if (['circle', 'rounded', 'square'].includes(src.photoShape)) theme.photoShape = src.photoShape;
	settings.theme = theme;
	return settings;
}

const langOf = (v, fallback) => (typeof v === 'string' && /^(tr|en)\b/i.test(v) ? v.slice(0, 2).toLowerCase() : fallback);

// Bir düğümün içinden okunabilenler: kişisel kutular ve bölümler ("sections" nesnesinin içi de sayılır)
function parts(node) {
	const k = keysOf(node);
	const inner = isObj(k.get('sections')) ? keysOf(k.get('sections')) : new Map();
	const personal = PERSON_BOXES.map(a => k.get(a)).filter(isObj).map(keysOf);
	const section = (aliases) => {
		const own = pick(k, aliases);
		return own === undefined ? pick(inner, aliases) : own;
	};
	return { k, inner, personal, section };
}

const hasPerson = k => !!(pick(k, PERSON.name) || pick(k, FIRST_NAME)) || !!pick(k, PERSON.email) || !!pick(k, PERSON.phone);

// CV'ye benziyor mu: dolu bir kişisel kutu, ad + iletişim, ya da en az iki bölüm.
// strict: başka bir CV'nin içinde aranırken kişi bilgisi tek başına yetmez (referans, ekip üyesi CV değildir).
function looksLikeCV(node, strict) {
	const { k, personal, section } = parts(node);
	const sections = SECTION_TYPES.filter(type => !TEXT_SECTIONS.includes(type) && Array.isArray(unbox(section(SECTION_KEYS[type])).list)).length;
	const named = !!(pick(k, PERSON.name) || pick(k, FIRST_NAME));
	const reachable = !!pick(k, PERSON.email) || !!pick(k, PERSON.phone);
	const person = personal.some(hasPerson);
	if (strict) return sections >= 2 || ((person || (named && reachable)) && sections >= 1);
	return person || (named && (reachable || sections >= 1)) || sections >= 2;
}

const KNOWN = new Set([...PERSON_BOXES, ...LINK_BOXES, ...PUBLICATIONS, 'sections', ...Object.values(PERSON).flat(), ...Object.values(SECTION_KEYS).flat()]);

// Dosyadaki CV'leri bulur. CV bir sarmalayıcının içinde olabilir ({ cvData }, { state: { profiles: [...] } }, [cv, cv]);
// sarmalayıcı da ad ve görünüm ayarı için saklanır.
function findCVs(node, parent, depth, out, strict) {
	if (depth > 6 || !node || typeof node !== 'object') return out;
	if (Array.isArray(node)) {
		node.slice(0, 50).forEach(child => findCVs(child, parent, depth + 1, out, strict));
		return out;
	}
	const own = looksLikeCV(node, strict);
	const before = out.length;
	// CV'ye benzeyen düğümde yalnız tanımadığımız alanların içine bakılır: asıl CV orada olabilir
	Object.keys(node).filter(key => !own || !KNOWN.has(fold(key))).forEach(key => findCVs(node[key], node, depth + 1, out, strict || own));
	if (own && out.length === before) out.push({ node, parent });
	return out;
}

function toProfile({ node, parent }, fallbackLang) {
	const { k, inner, personal, section } = parts(node);
	const meta = isObj(k.get('metadata')) ? keysOf(k.get('metadata')) : (isObj(k.get('meta')) ? keysOf(k.get('meta')) : new Map());
	const outer = keysOf(parent);
	const lang = langOf(pick(meta, ['locale', 'language', 'lang']), langOf(pick(outer, ['language', 'locale', 'lang']), fallbackLang));
	const profile = newProfile('CV', lang);
	const data = profile.data;

	// Kişisel kutu yoksa bilgiler CV'nin en üst düzeyinde durur
	const boxes = personal.length ? personal : [k];
	const linkBoxes = [k, inner, ...personal].flatMap(map => LINK_BOXES.map(a => unbox(map.get(a)).list));
	data.personal = personOf([...boxes, ...linkBoxes.filter(isObj).map(keysOf)], linkBoxes.filter(Array.isArray));

	const visible = {};
	SECTION_TYPES.forEach((type) => {
		if (type === 'summary') {
			const found = SECTION_KEYS.summary.map(a => (k.has(a) ? k.get(a) : inner.get(a))).find(v => proseOf(v));
			visible.summary = !isObj(found) || found.visible !== false;
			data.summary = proseOf(found) || boxes.map(b => proseOf(pick(b, ['summary', 'about', 'bio', 'objective', 'description']))).find(Boolean) || '';
			return;
		}
		const box = unbox(section(SECTION_KEYS[type]));
		visible[type] = box.visible;
		if (type === 'hobbies') {
			data.hobbies = hobbiesOf(box.list);
		} else if (type === 'skills') {
			data.skills = skillsOf(box.list);
		} else if (type === 'languages') {
			data.languages = languagesOf(box.list);
		} else {
			data[type] = (Array.isArray(box.list) ? box.list : []).filter(raw => !blank(raw)).map(raw => listItem(type, raw, lang));
		}
	});
	// Yayınlar için ayrı bölümümüz yok: ödüllerin yanına eklenir, tek başınaysa bölüm "Yayınlar" adını alır
	const papers = unbox(section(PUBLICATIONS)).list;
	const publications = (Array.isArray(papers) ? papers : []).filter(raw => !blank(raw)).map(raw => listItem('awards', raw, lang));
	const awardsTitle = publications.length && !data.awards.length ? (lang === 'tr' ? 'Yayınlar' : 'Publications') : '';
	data.awards = [...data.awards, ...publications];

	// Sıra ve görünürlük: dosyada bölüm listesi varsa (NextCV) o geçerli; yoksa yalnız dolu bölümler görünür
	const listed = Array.isArray(k.get('sections')) ? k.get('sections') : [];
	const typeOf = raw => SECTION_TYPES.find(type => SECTION_KEYS[type].includes(fold(text(isObj(raw) ? raw.type || raw.id || raw.key : raw))));
	const order = listed.map(raw => ({ type: typeOf(raw), visible: !isObj(raw) || raw.visible !== false, title: '' })).filter(s => s.type);
	const seen = new Set(order.map(s => s.type));
	SECTION_TYPES.filter(type => !seen.has(type)).forEach(type => order.push({ type, visible: visible[type] && sectionHasContent(data, type), title: '' }));
	order.find(s => s.type === 'awards').title = awardsTitle;
	data.sections = order;

	const person = data.personal;
	if (!person.name && !person.email && !person.phone && !SECTION_TYPES.some(type => sectionHasContent(data, type))) {
		return null;
	}
	const title = isObj(parent) && typeof parent.name === 'string' ? parent.name.trim() : '';
	return normalize({ ...profile, name: title || person.name || 'CV', settings: settingsOf(isObj(parent) && parent.appSettings ? parent : node, lang) }, lang);
}

// Okunmuş JSON'dan profiller. Tanınmayan dosyada 'unknown-format' hatası verir.
export function importAny(obj, fallbackLang) {
	if (isObj(obj) && obj.format === EXPORT_FORMAT && Array.isArray(obj.profiles)) {
		return obj.profiles.map(p => normalize(p, fallbackLang));
	}
	// Bizim tek profil: { name, settings, data: { personal, ... } }
	if (isObj(obj) && isObj(obj.data) && isObj(obj.data.personal) && (Array.isArray(obj.data.sections) || isObj(obj.settings))) {
		return [normalize(obj, fallbackLang)];
	}
	const profiles = findCVs(obj, null, 0, [], false).map(found => toProfile(found, fallbackLang)).filter(Boolean);
	if (!profiles.length) {
		throw new Error('unknown-format');
	}
	return profiles;
}

export function parseImport(text, fallbackLang) {
	return importAny(JSON.parse(text), fallbackLang);
}
