// Şablonlar: profil verisini sütunlara ve bloklara çevirir. Her blok bölünmeyen bir parçadır (başlık, bir deneyim…);
// sayfalama bu blokları ölçüp A4 sayfalara dağıtır. Blok `render` fonksiyonu olarak tutulur, iki yerde (ölçüm + sayfa) çizilir.
import { doc, formatBirthDate, formatDate, formatRange } from '../i18n.js';
import { LIST_SECTIONS, TEXT_SECTIONS, sectionHasContent } from '../model.js';

const ICON = {
	location: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
	email: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
	phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
	link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
	globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
};

function Icon({ name }) {
	return <svg class="cv-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[name] }} />;
}

const trim = v => String(v || '').trim();
const hasText = v => !!trim(v);

function href(kind, value) {
	const v = trim(value);
	if (kind === 'email') return `mailto:${v}`;
	if (kind === 'phone') return `tel:${v.replace(/[^+\d]/g, '')}`;
	if (/^https?:\/\//i.test(v)) return v;
	return `https://${v.replace(/^\/+/, '')}`;
}

function display(kind, value) {
	let v = trim(value);
	if (kind === 'linkedin' || kind === 'github' || kind === 'website') {
		v = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
	}
	return v;
}

export function contactItems(personal) {
	const items = [];
	const push = (kind, icon, link) => { if (hasText(personal[kind])) items.push({ kind, icon, text: display(kind, personal[kind]), href: link ? href(kind, personal[kind]) : null }); };
	push('location', 'location', false);
	push('email', 'email', true);
	push('phone', 'phone', true);
	push('linkedin', 'link', true);
	push('github', 'link', true);
	push('website', 'globe', true);
	return items;
}

function extras(personal, lang) {
	const L = doc(lang).labels;
	const out = [];
	if (hasText(personal.nationality)) out.push(`${L.nationality}: ${trim(personal.nationality)}`);
	if (hasText(personal.license)) out.push(`${L.license}: ${trim(personal.license)}`);
	if (hasText(personal.birthDate)) out.push(`${L.birthDate}: ${formatBirthDate(personal.birthDate, lang)}`);
	return out;
}

function ContactLine({ items, icons, cls }) {
	return (
		<ul class={`cv-contact ${cls || ''}`}>
			{items.map(it => (
				<li key={it.kind}>
					{icons ? <Icon name={it.icon} /> : null}
					{it.href ? <a href={it.href}>{it.text}</a> : <span>{it.text}</span>}
				</li>
			))}
		</ul>
	);
}

function Photo({ personal, theme }) {
	if (!personal.photo) return null;
	return <img class={`cv-photo cv-photo--${theme.photoShape} cv-photo--${theme.photoSize}`} src={personal.photo} alt="" />;
}

function sectionTitle(data, type, lang) {
	const s = data.sections.find(x => x.type === type);
	return (s && trim(s.title)) || doc(lang).sections[type];
}

function Bullets({ bullets }) {
	const list = (bullets || []).map(trim).filter(Boolean);
	if (!list.length) return null;
	return <ul class="cv-bullets">{list.map((b, i) => <li key={i}>{b}</li>)}</ul>;
}

// Deneyim, proje, eğitim, topluluk: ortak giriş yapısı
function Entry({ head, sub, right, bullets, link }) {
	return (
		<div class="cv-entry">
			<div class="cv-entry-row">
				<span class="cv-entry-head">{head}{link ? <a class="cv-entry-link" href={href('website', link)}>{display('website', link)}</a> : null}</span>
				{right ? <span class="cv-entry-right">{right}</span> : null}
			</div>
			{sub ? <div class="cv-entry-sub">{sub}</div> : null}
			<Bullets bullets={bullets} />
		</div>
	);
}

function join(parts, sep = ' · ') {
	return parts.map(trim).filter(Boolean).join(sep);
}

// Harvard düzeni: 1. satır kurum (kalın) | yer, 2. satır pozisyon (italik) | tarih.
// İkinci bilgi yoksa: 1. satır ad | tarih, 2. satır yer/veren (italik).
function HEntry({ primary, secondary, place, dates, bullets, link }) {
	const rows = secondary ? [[primary, place], [secondary, dates]] : [[primary, dates], [place, '']];
	return (
		<div class="cv-entry cv-entry--h">
			<div class="cv-entry-row">
				<span class="cv-entry-head">{rows[0][0]}{link ? <a class="cv-entry-link" href={href('website', link)}>{display('website', link)}</a> : null}</span>
				{rows[0][1] ? <span class="cv-entry-right">{rows[0][1]}</span> : null}
			</div>
			{rows[1][0] || rows[1][1] ? (
				<div class="cv-entry-row">
					<span class="cv-entry-role">{rows[1][0]}</span>
					{rows[1][1] ? <span class="cv-entry-right">{rows[1][1]}</span> : null}
				</div>
			) : null}
			<Bullets bullets={bullets} />
		</div>
	);
}

// Harvard şablonunda bir öğenin satırları
function harvardEntry(type, i, lang, D) {
	const range = (cur) => formatRange(i.start, i.end, cur, lang);
	if (type === 'experience') {
		return { primary: trim(i.company) || trim(i.role), secondary: hasText(i.company) ? trim(i.role) : '', place: trim(i.location), dates: range(i.current), bullets: i.bullets };
	}
	if (type === 'education') {
		const gpa = hasText(i.gpa) ? `${D.labels.gpa} ${trim(i.gpa)}` : '';
		return { primary: trim(i.school) || trim(i.degree), secondary: join([hasText(i.school) ? i.degree : '', gpa]), place: trim(i.location), dates: range(false), bullets: i.bullets };
	}
	if (type === 'involvement') {
		return { primary: trim(i.org) || trim(i.role), secondary: hasText(i.org) ? trim(i.role) : '', place: '', dates: range(false), bullets: i.bullets };
	}
	if (type === 'projects') return { primary: trim(i.name), link: i.link, dates: range(false), bullets: i.bullets };
	if (type === 'certifications') return { primary: trim(i.name), link: i.link, dates: formatDate(i.date, lang), place: trim(i.issuer) };
	if (type === 'awards') return { primary: trim(i.name), dates: formatDate(i.date, lang), place: join([i.issuer, i.note]) };
	return { primary: trim(i.name), dates: join([i.email, i.phone], ' · '), place: join([i.title, i.company]) };
}

const ENTRY_REQUIRED = {
	experience: i => hasText(i.role) || hasText(i.company),
	education: i => hasText(i.degree) || hasText(i.school),
	involvement: i => hasText(i.role) || hasText(i.org),
};

// Bir bölümün bloklarını üretir: başlık (sonrakiyle birlikte kalır) + öğeler
function sectionBlocks(data, type, lang, titleStyle, template) {
	if (!sectionHasContent(data, type)) return [];
	const title = sectionTitle(data, type, lang);
	const blocks = [{ key: `t:${type}`, keepWithNext: true, render: () => <h2 class={`cv-h2 cv-h2--${titleStyle}`}>{title}</h2> }];
	const D = doc(lang);
	const items = (data[type] || []);
	if (TEXT_SECTIONS.includes(type)) {
		blocks.push({ key: `p:${type}`, render: () => <p class="cv-text">{trim(data[type])}</p> });
		return blocks;
	}
	if (type === 'skills') {
		const rows = items.filter(i => hasText(i.items) || hasText(i.group));
		blocks.push({ key: `skills`, render: () => (
			<dl class="cv-skills">
				{rows.map(i => (
					<div class="cv-skill" key={i.id}>
						{hasText(i.group) ? <dt>{trim(i.group)}</dt> : null}
						<dd>{trim(i.items)}</dd>
					</div>
				))}
			</dl>
		) });
		return blocks;
	}
	if (type === 'languages') {
		const rows = items.filter(i => hasText(i.name));
		blocks.push({ key: 'languages', render: () => (
			<ul class="cv-langs">
				{rows.map(i => <li key={i.id}><span class="cv-lang-name">{trim(i.name)}</span><span class="cv-lang-level">{D.levels[i.level] || trim(i.level)}</span></li>)}
			</ul>
		) });
		return blocks;
	}
	items.forEach((i, idx) => {
		const key = `${type}:${i.id || idx}`;
		if (template === 'harvard') {
			if (ENTRY_REQUIRED[type] ? !ENTRY_REQUIRED[type](i) : !hasText(i.name)) return;
			blocks.push({ key, render: () => <HEntry {...harvardEntry(type, i, lang, D)} /> });
			return;
		}
		if (type === 'experience') {
			if (!hasText(i.role) && !hasText(i.company)) return;
			blocks.push({ key, render: () => <Entry head={trim(i.role) || trim(i.company)} sub={join([hasText(i.role) ? i.company : '', i.location])} right={formatRange(i.start, i.end, i.current, lang)} bullets={i.bullets} /> });
		} else if (type === 'projects') {
			if (!hasText(i.name)) return;
			blocks.push({ key, render: () => <Entry head={trim(i.name)} link={i.link} right={formatRange(i.start, i.end, false, lang)} bullets={i.bullets} /> });
		} else if (type === 'education') {
			if (!hasText(i.degree) && !hasText(i.school)) return;
			const gpa = hasText(i.gpa) ? `${D.labels.gpa} ${trim(i.gpa)}` : '';
			blocks.push({ key, render: () => <Entry head={trim(i.degree) || trim(i.school)} sub={join([hasText(i.degree) ? i.school : '', i.location, gpa])} right={formatRange(i.start, i.end, false, lang)} bullets={i.bullets} /> });
		} else if (type === 'involvement') {
			if (!hasText(i.role) && !hasText(i.org)) return;
			blocks.push({ key, render: () => <Entry head={trim(i.role) || trim(i.org)} sub={hasText(i.role) ? trim(i.org) : ''} right={formatRange(i.start, i.end, false, lang)} bullets={i.bullets} /> });
		} else if (type === 'certifications') {
			if (!hasText(i.name)) return;
			blocks.push({ key, render: () => <Entry head={trim(i.name)} link={i.link} sub={trim(i.issuer)} right={formatDate(i.date, lang)} /> });
		} else if (type === 'awards') {
			if (!hasText(i.name)) return;
			blocks.push({ key, render: () => <Entry head={trim(i.name)} sub={join([i.issuer, i.note])} right={formatDate(i.date, lang)} /> });
		} else if (type === 'references') {
			if (!hasText(i.name)) return;
			blocks.push({ key, render: () => <Entry head={trim(i.name)} sub={join([i.title, i.company])} right={join([i.email, i.phone], ' · ')} /> });
		}
	});
	return blocks.length > 1 ? blocks : [];
}

function headerBlock(profile, lang, variant) {
	const { personal } = profile.data;
	const { theme } = profile.settings;
	const items = contactItems(personal);
	const ex = extras(personal, lang);
	return {
		key: 'header',
		render: () => (
			<header class={`cv-header cv-header--${variant}`}>
				{variant !== 'harvard' && variant !== 'yan' ? <Photo personal={personal} theme={theme} /> : null}
				<div class="cv-header-text">
					<h1 class="cv-name">{trim(personal.name) || ' '}</h1>
					{hasText(personal.title) ? <p class="cv-title">{trim(personal.title)}</p> : null}
					{variant !== 'yan' && items.length ? <ContactLine items={items} icons={theme.icons} cls="cv-contact--row" /> : null}
					{variant !== 'yan' && ex.length ? <p class="cv-extras">{ex.join(' · ')}</p> : null}
				</div>
				{variant === 'harvard' ? <Photo personal={personal} theme={theme} /> : null}
			</header>
		),
	};
}

function visibleTypes(data) {
	return data.sections.filter(s => s.visible).map(s => s.type).filter(t => LIST_SECTIONS[t] || TEXT_SECTIONS.includes(t));
}

// --- Şablonlar ---

const SIDE_TYPES = ['skills', 'languages', 'certifications', 'hobbies'];

export function buildTemplate(profile) {
	const lang = profile.settings.lang;
	const { template, theme } = profile.settings;
	const { data } = profile;
	const titleStyle = theme.titleStyle;
	const types = visibleTypes(data);

	// Yan sütun: iletişim, beceriler, diller, sertifikalar ve ilgi alanları solda
	if (template === 'yan') {
		const side = [];
		const items = contactItems(data.personal);
		const ex = extras(data.personal, lang);
		side.push({ key: 'side-top', render: () => (
			<div class="cv-side-top">
				<Photo personal={data.personal} theme={theme} />
				{items.length || ex.length ? <h2 class={`cv-h2 cv-h2--${titleStyle}`}>{doc(lang).sections.contact}</h2> : null}
				<ContactLine items={items} icons={theme.icons} cls="cv-contact--stack" />
				{ex.length ? <p class="cv-extras">{ex.map((e, i) => <span key={i}>{e}</span>)}</p> : null}
			</div>
		) });
		types.filter(t => SIDE_TYPES.includes(t)).forEach(t => side.push(...sectionBlocks(data, t, lang, titleStyle, template)));
		const main = [headerBlock(profile, lang, 'yan')];
		types.filter(t => !SIDE_TYPES.includes(t)).forEach(t => main.push(...sectionBlocks(data, t, lang, titleStyle, template)));
		return { template, columns: [{ key: 'side', width: 0.31, blocks: side }, { key: 'main', width: 0.69, blocks: main }] };
	}

	// Tek sütun: Sade, Harvard, Sıkışık
	const main = [headerBlock(profile, lang, template)];
	types.forEach(t => main.push(...sectionBlocks(data, t, lang, titleStyle, template)));
	return { template, columns: [{ key: 'main', width: 1, blocks: main }] };
}
