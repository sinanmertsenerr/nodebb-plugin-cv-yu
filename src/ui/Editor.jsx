// Sol panel: kişisel bilgiler ve bölümler. Her alanın görünür etiketi var.
// Bölümler ve öğeler tutamaçtan tutup sürüklenerek sıralanır; tutamaç odaktayken ↑/↓ da taşır.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { LIST_SECTIONS, TEXT_SECTIONS, LEVELS, emptyItem, sectionHasContent } from '../model.js';
import { doc } from '../i18n.js';
import { shrinkPhoto } from '../storage.js';
import { Icon } from './icons.jsx';
import { moveItem, useSortable } from './sortable.js';

const FIELD_LABEL = {
	experience: { role: 'field.role', company: 'field.company', location: 'field.location', start: 'field.start', end: 'field.end' },
	projects: { name: 'field.projectName', link: 'field.link', start: 'field.start', end: 'field.end' },
	education: { degree: 'field.degree', school: 'field.school', location: 'field.location', start: 'field.start', end: 'field.end', gpa: 'field.gpa' },
	involvement: { role: 'field.role', org: 'field.org', start: 'field.start', end: 'field.end' },
	skills: { group: 'field.group', items: 'field.items' },
	certifications: { name: 'field.certName', issuer: 'field.issuer', date: 'field.date', link: 'field.link' },
	languages: { name: 'field.language', level: 'field.level' },
	awards: { name: 'field.awardName', issuer: 'field.issuer', date: 'field.date', note: 'field.note' },
	references: { name: 'field.refName', title: 'field.refTitle', company: 'field.refCompany', email: 'field.email', phone: 'field.phone' },
};
const PLACEHOLDER = { role: '', company: '', location: 'field.location.ph', start: 'field.date.ph', end: 'field.date.ph', degree: 'field.degree.ph', gpa: 'field.gpa.ph', group: 'field.group.ph', items: 'field.items.ph', date: 'field.date.ph' };
const WIDE = { items: true, note: true, link: true };
const DATE_FIELDS = { start: true, end: true, date: true };

export function Field({ id, label, value, onInput, placeholder, type, wide, autocomplete, inputmode, hint }) {
	return (
		<div class={`cvf ${wide ? 'cvf--wide' : ''}`}>
			<label class="cvf-label" for={id}>{label}</label>
			<input class="cvf-input" id={id} type={type || 'text'} value={value || ''} placeholder={placeholder || ''} autocomplete={autocomplete || 'off'} inputmode={inputmode} data-bwignore data-1p-ignore data-lpignore="true" onInput={e => onInput(e.currentTarget.value)} />
			{hint ? <p class="cvf-hint">{hint}</p> : null}
		</div>
	);
}

function IconButton({ label, icon, onClick, disabled, pressed, danger }) {
	return (
		<button type="button" class={`cvb-icon ${danger ? 'cvb-icon--danger' : ''}`} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
			<Icon name={icon} />
		</button>
	);
}

// Yazdıkça aşağı doğru uzayan metin kutusu. field-sizing destekleyen tarayıcıda CSS yapar, diğerlerinde yükseklik ölçülür.
const FIELD_SIZING = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('field-sizing', 'content');

function fit(el) {
	if (FIELD_SIZING || !el || !el.offsetWidth) return;
	el.style.height = 'auto';
	el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

export function AutoText({ value, onInput, rows, class: cls, ...rest }) {
	const ref = useRef(null);
	useLayoutEffect(() => { fit(ref.current); }, [value]);
	useEffect(() => {
		// Genişlik değişince (telefon döndü, sekme açıldı) yeniden ölç
		if (FIELD_SIZING || typeof ResizeObserver === 'undefined') return undefined;
		let width = 0;
		const ro = new ResizeObserver((entries) => {
			const w = entries[0].contentRect.width;
			if (w && w !== width) { width = w; fit(ref.current); }
		});
		ro.observe(ref.current);
		return () => ro.disconnect();
	}, []);
	return <textarea ref={ref} class={`cvf-input cvf-auto ${cls || ''}`} rows={rows || 1} style={{ '--rows': rows || 1 }} value={value || ''} onInput={e => onInput(e.currentTarget.value)} data-bwignore data-1p-ignore data-lpignore="true" {...rest} />;
}

function Area({ id, label, value, onInput, placeholder, rows, hint }) {
	return (
		<div class="cvf cvf--wide">
			<label class="cvf-label" for={id}>{label}</label>
			<AutoText id={id} rows={rows || 3} value={value} placeholder={placeholder || ''} onInput={onInput} />
			{hint ? <p class="cvf-hint">{hint}</p> : null}
		</div>
	);
}

// Maddeler: her madde kendi satırında uzar. Enter imlecin yerinden böler, satır başında ⌫ öncekiyle birleştirir,
// çok satırlı yapıştırma her satırı ayrı madde yapar.
const BULLET_MARK = /^\s*(?:[-–—•*·▪●◦]|\d{1,2}[.)])\s*/;

function BulletList({ t, base, bullets, setBullets }) {
	const listRef = useRef(null);
	const focusAt = useRef(null);
	useLayoutEffect(() => {
		if (!focusAt.current) return;
		const [i, caret] = focusAt.current;
		focusAt.current = null;
		const el = listRef.current && listRef.current.querySelectorAll('textarea')[i];
		if (!el) return;
		el.focus();
		const pos = caret === 'end' ? el.value.length : caret;
		el.setSelectionRange(pos, pos);
	});
	const replaceAt = (i, parts, focus) => {
		const next = bullets.slice();
		next.splice(i, 1, ...parts);
		focusAt.current = focus;
		setBullets(next);
	};
	const onKeyDown = i => (e) => {
		if (e.isComposing) return;
		const el = e.currentTarget;
		if (e.key === 'Enter') {
			e.preventDefault();
			replaceAt(i, [el.value.slice(0, el.selectionStart).trimEnd(), el.value.slice(el.selectionEnd).trimStart()], [i + 1, 0]);
		} else if (e.key === 'Backspace' && i > 0 && el.selectionStart === 0 && el.selectionEnd === 0) {
			e.preventDefault();
			const prev = bullets[i - 1];
			const next = bullets.slice();
			next.splice(i - 1, 2, prev + el.value);
			focusAt.current = [i - 1, prev.length];
			setBullets(next);
		}
	};
	const onPaste = i => (e) => {
		const text = e.clipboardData ? e.clipboardData.getData('text') : '';
		const lines = /\n/.test(text.trim()) ? text.split(/\r?\n/).map(l => l.replace(BULLET_MARK, '').trim()).filter(Boolean) : [];
		if (lines.length < 2) return;
		e.preventDefault();
		const el = e.currentTarget;
		const last = lines.length - 1;
		lines[0] = el.value.slice(0, el.selectionStart) + lines[0];
		const caret = lines[last].length;
		lines[last] += el.value.slice(el.selectionEnd);
		replaceAt(i, lines, [i + last, caret]);
	};
	return (
		<ul class="cv-bullet-list" ref={listRef}>
			{bullets.map((b, i) => (
				<li key={i}>
					<AutoText id={`${base}-b${i}`} class="cv-bullet-input" aria-label={`${t('bullets.label')} ${i + 1}`} value={b} placeholder={t('bullets.placeholder')}
						onInput={v => replaceAt(i, [v.replace(/\s*\n\s*/g, ' ')], null)} onKeyDown={onKeyDown(i)} onPaste={onPaste(i)} />
					<IconButton label={t('bullets.remove')} icon="x" onClick={() => replaceAt(i, bullets.length > 1 ? [] : [''], bullets.length > 1 ? [Math.max(0, i - 1), 'end'] : [0, 0])} />
				</li>
			))}
		</ul>
	);
}

function Grip({ label, sortKey, sort }) {
	return (
		<button type="button" class="cv-grip" aria-label={label} title={label} data-sort-key={sortKey} onPointerDown={sort.onPointerDown} onKeyDown={sort.onKeyDown}>
			<Icon name="grip" />
		</button>
	);
}

function PersonalForm({ t, profile, update }) {
	const p = profile.data.personal;
	const pid = `${profile.id}-p`;
	const set = (k, v) => update(d => ({ ...d, personal: { ...d.personal, [k]: v } }));
	const [photoError, setPhotoError] = useState('');
	const onPhoto = async (e) => {
		const file = e.currentTarget.files && e.currentTarget.files[0];
		e.currentTarget.value = '';
		if (!file) return;
		try {
			set('photo', await shrinkPhoto(file));
			setPhotoError('');
		} catch (err) {
			setPhotoError(t('field.photo.error'));
		}
	};
	return (
		<div class="cv-fields">
			<div class="cvf cvf--wide cv-photo-field">
				<span class="cvf-label">{t('field.photo')}</span>
				<div class="cv-photo-row">
					{p.photo ? <img class="cv-photo-thumb" src={p.photo} alt="" /> : <span class="cv-photo-thumb cv-photo-thumb--empty" aria-hidden="true"><Icon name="user" /></span>}
					<label class="cvb cvb--secondary">
						<input type="file" accept="image/jpeg,image/png,image/webp" class="cv-visually-hidden" onChange={onPhoto} />
						{t('field.photo.upload')}
					</label>
					{p.photo ? <button type="button" class="cvb cvb--ghost" onClick={() => set('photo', '')}>{t('field.photo.remove')}</button> : null}
				</div>
				<p class="cvf-hint">{photoError || t('field.photo.hint')}</p>
			</div>
			<Field id={`${pid}-name`} label={t('field.name')} value={p.name} onInput={v => set('name', v)} autocomplete="name" wide />
			<Field id={`${pid}-title`} label={t('field.title')} value={p.title} onInput={v => set('title', v)} placeholder={t('field.title.ph')} autocomplete="organization-title" wide />
			<Field id={`${pid}-location`} label={t('field.location')} value={p.location} onInput={v => set('location', v)} placeholder={t('field.location.ph')} />
			<Field id={`${pid}-email`} label={t('field.email')} value={p.email} onInput={v => set('email', v)} type="email" autocomplete="email" />
			<Field id={`${pid}-phone`} label={t('field.phone')} value={p.phone} onInput={v => set('phone', v)} type="tel" autocomplete="tel" inputmode="tel" />
			<Field id={`${pid}-linkedin`} label={t('field.linkedin')} value={p.linkedin} onInput={v => set('linkedin', v)} placeholder={t('field.linkedin.ph')} inputmode="url" />
			<Field id={`${pid}-github`} label={t('field.github')} value={p.github} onInput={v => set('github', v)} placeholder={t('field.github.ph')} inputmode="url" />
			<Field id={`${pid}-website`} label={t('field.website')} value={p.website} onInput={v => set('website', v)} inputmode="url" autocomplete="url" />
			<Field id={`${pid}-nationality`} label={t('field.nationality')} value={p.nationality} onInput={v => set('nationality', v)} />
			<Field id={`${pid}-license`} label={t('field.license')} value={p.license} onInput={v => set('license', v)} placeholder={t('field.license.ph')} />
			<Field id={`${pid}-birth`} label={t('field.birthDate')} value={p.birthDate} onInput={v => set('birthDate', v)} placeholder={t('field.birthDate.ph')} hint={profile.settings.lang === 'en' ? t('field.birthDate.enHint') : ''} />
		</div>
	);
}

// Öğe başlığı: doldurulmuşsa öğenin kendi adı (taranması kolay), değilse sıra numarası
const ENTRY_NAME = ['role', 'name', 'degree', 'group'];

function ItemForm({ t, type, item, idx, count, profile, update, sort }) {
	const def = LIST_SECTIONS[type];
	const base = `${profile.id}-${type}-${item.id}`;
	const setItem = patch => update(d => ({ ...d, [type]: d[type].map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
	const remove = () => update(d => ({ ...d, [type]: d[type].filter((_, i) => i !== idx) }));
	const nameKey = ENTRY_NAME.find(k => item[k] && String(item[k]).trim());
	const name = nameKey ? String(item[nameKey]).trim() : t('entry.n', idx + 1);
	return (
		<fieldset class="cv-item" data-sort-item>
			<legend class="cv-item-legend">
				{count > 1 ? <Grip label={t('sort.entry', name)} sortKey={item.id} sort={sort} /> : null}
				<span class="cv-item-name">{name}</span>
				<span class="cv-item-tools">
					<IconButton label={t('entry.remove')} icon="trash" onClick={remove} danger />
				</span>
			</legend>
			<div class="cv-fields">
				{def.fields.map((f) => {
					if (f === 'current') {
						return (
							<label class="cvf cvf--check" key={f}>
								<input type="checkbox" checked={!!item.current} onChange={e => setItem({ current: e.currentTarget.checked })} />
								<span>{t('current')}</span>
							</label>
						);
					}
					if (f === 'level') {
						const id = `${base}-level`;
						return (
							<div class="cvf" key={f}>
								<label class="cvf-label" for={id}>{t('field.level')}</label>
								<select class="cvf-input" id={id} value={item.level || 'intermediate'} onChange={e => setItem({ level: e.currentTarget.value })}>
									{LEVELS.map(l => <option value={l} key={l}>{t(`level.${l}`)}</option>)}
								</select>
							</div>
						);
					}
					if (f === 'note' || f === 'items') {
						return <Area key={f} id={`${base}-${f}`} label={t(FIELD_LABEL[type][f])} value={item[f]} onInput={v => setItem({ [f]: v })} placeholder={PLACEHOLDER[f] ? t(PLACEHOLDER[f]) : ''} rows={2} />;
					}
					const disabled = f === 'end' && item.current;
					return (
						<div class={`cvf ${WIDE[f] ? 'cvf--wide' : ''}`} key={f}>
							<label class="cvf-label" for={`${base}-${f}`}>{t(FIELD_LABEL[type][f])}</label>
							<input class="cvf-input" id={`${base}-${f}`} type={f === 'email' ? 'email' : (f === 'phone' ? 'tel' : 'text')} inputmode={DATE_FIELDS[f] ? 'numeric' : undefined} value={disabled ? '' : (item[f] || '')} disabled={disabled} placeholder={PLACEHOLDER[f] ? t(PLACEHOLDER[f]) : ''} onInput={e => setItem({ [f]: e.currentTarget.value })} />
						</div>
					);
				})}
				{def.bullets ? (
					<div class="cvf cvf--wide">
						<span class="cvf-label">{t('bullets.label')}</span>
						<BulletList t={t} base={base} bullets={item.bullets && item.bullets.length ? item.bullets : ['']} setBullets={next => setItem({ bullets: next })} />
						<button type="button" class="cvb cvb--ghost cvb--sm" onClick={() => setItem({ bullets: [...(item.bullets || []), ''] })}><Icon name="plus" />{t('bullets.add')}</button>
						<p class="cvf-hint">{t('bullets.hint')}</p>
					</div>
				) : null}
			</div>
		</fieldset>
	);
}

function SectionBody({ t, type, profile, update }) {
	const d = profile.data;
	if (TEXT_SECTIONS.includes(type)) {
		const key = type === 'summary' ? 'field.summary' : 'field.hobbies';
		return (
			<div class="cv-fields">
				<Area id={`${profile.id}-${type}`} label={t(key)} value={d[type]} onInput={v => update(x => ({ ...x, [type]: v }))} placeholder={t(`${key}.ph`)} rows={type === 'summary' ? 4 : 2} />
			</div>
		);
	}
	const list = d[type] || [];
	return (
		<div>
			{type === 'references' ? <p class="cv-note"><Icon name="info" />{t('references.hint')}</p> : null}
			{list.length ? <ItemList t={t} type={type} list={list} profile={profile} update={update} /> : <p class="cvf-hint">{t('section.empty')}</p>}
			<button type="button" class="cvb cvb--secondary" onClick={() => update(x => ({ ...x, [type]: [...(x[type] || []), emptyItem(type)] }))}><Icon name="plus" />{t('entry.add')} · {t(`section.${type}`)}</button>
		</div>
	);
}

function ItemList({ t, type, list, profile, update }) {
	const sort = useSortable((from, to) => update(d => ({ ...d, [type]: moveItem(d[type], from, to) })));
	return (
		<div class="cv-sortable">
			{list.map((item, idx) => <ItemForm key={item.id} t={t} type={type} item={item} idx={idx} count={list.length} profile={profile} update={update} sort={sort} />)}
		</div>
	);
}

function SectionCard({ t, profile, update, section, open, onToggle, sort }) {
	const { type } = section;
	const lang = profile.settings.lang;
	const filled = sectionHasContent(profile.data, type);
	const items = TEXT_SECTIONS.includes(type) ? (filled ? 1 : 0) : (profile.data[type] || []).length;
	const setSection = patch => update(d => ({ ...d, sections: d.sections.map(s => (s.type === type ? { ...s, ...patch } : s)) }));
	const bodyId = `${profile.id}-sec-${type}`;
	return (
		<section class={`cv-card ${section.visible ? '' : 'cv-card--hidden'}`} data-sort-item>
			<div class="cv-card-head">
				<Grip label={t('sort.section', t(`section.${type}`))} sortKey={type} sort={sort} />
				<button type="button" class="cv-card-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
					<Icon name={open ? 'chevron-down' : 'chevron-right'} />
					<span class="cv-card-title">{t(`section.${type}`)}</span>
					{items ? <span class="cv-count" aria-label={t('entry.n', items)}>{items}</span> : null}
				</button>
				<span class="cv-card-tools">
					<IconButton label={section.visible ? t('section.hide') : t('section.show')} icon={section.visible ? 'eye' : 'eye-off'} pressed={!section.visible} onClick={() => setSection({ visible: !section.visible })} />
				</span>
			</div>
			{open ? (
				<div class="cv-card-body" id={bodyId}>
					<div class="cv-fields">
						<Field id={`${profile.id}-${type}-title`} label={t('section.titleLabel')} value={section.title} onInput={v => setSection({ title: v })} placeholder={t('section.titlePlaceholder', doc(lang).sections[type])} wide />
					</div>
					<SectionBody t={t} type={type} profile={profile} update={update} />
				</div>
			) : null}
		</section>
	);
}

export function Editor({ t, profile, update }) {
	const [open, setOpen] = useState({ personal: true });
	const toggle = key => setOpen(o => ({ ...o, [key]: !o[key] }));
	const sections = profile.data.sections;
	const sort = useSortable((from, to) => update(d => ({ ...d, sections: moveItem(d.sections, from, to) })));
	return (
		<div class="cv-editor">
			<section class="cv-card">
				<div class="cv-card-head">
					<button type="button" class="cv-card-toggle" aria-expanded={!!open.personal} aria-controls={`${profile.id}-sec-personal`} onClick={() => toggle('personal')}>
						<Icon name={open.personal ? 'chevron-down' : 'chevron-right'} />
						<span class="cv-card-title">{t('section.personal')}</span>
					</button>
				</div>
				{open.personal ? <div class="cv-card-body" id={`${profile.id}-sec-personal`}><PersonalForm t={t} profile={profile} update={update} /></div> : null}
			</section>
			<h2 class="cv-editor-h">{t('sections.title')}</h2>
			<p class="cvf-hint cv-editor-help">{t('sections.help')}</p>
			<div class="cv-sortable">
				{sections.map(s => (
					<SectionCard key={s.type} t={t} profile={profile} update={update} section={s} open={!!open[s.type]} onToggle={() => toggle(s.type)} sort={sort} />
				))}
			</div>
		</div>
	);
}
