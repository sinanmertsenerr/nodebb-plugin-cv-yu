// Uygulama kökü: durum, kayıt (cihaz / hesap), araç çubuğu, düzenleyici ve önizleme. window.YuCV.mount/unmount ile bağlanır.
import { render } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { makeT, uiLangOf } from './i18n.js';
import { EXPORT_FORMAT, TEMPLATES, newProfile, normalize, switchTemplate } from './model.js';
import { api, clearLocal, downloadJSON, loadLocal, merge, saveLocal } from './storage.js';
import { Editor, Field } from './ui/Editor.jsx';
import { ThemePanel } from './ui/ThemePanel.jsx';
import { Preview, PreviewBoundary, isEmpty } from './ui/Preview.jsx';
import { Icon } from './ui/icons.jsx';
import { sampleProfile } from './sample.js';
import { buildPrompt, profileFromAI, readImport } from './ai.js';
import { isReadable, textFromFile } from './filetext.js';

const MAX_PROFILES = 5;
const UNTITLED = ['Adsız CV', 'Untitled CV'];
const isUntitled = name => !String(name || '').trim() || UNTITLED.includes(String(name).trim());
const BACKUP_AFTER_CHANGES = 25;
const BACKUP_AFTER_MS = 24 * 60 * 60 * 1000;

function reducer(state, action) {
	switch (action.type) {
		case 'init':
			return { ...state, ...action.state, loaded: true };
		case 'profile': {
			const profile = { ...action.profile, updatedAt: Date.now() };
			return { ...state, profiles: { ...state.profiles, [profile.id]: profile }, changes: state.changes + 1 };
		}
		case 'add': {
			const profiles = { ...state.profiles };
			action.profiles.forEach((p) => { profiles[p.id] = p; });
			return { ...state, profiles, activeId: action.activate ? action.profiles[action.profiles.length - 1].id : state.activeId, changes: state.changes + 1 };
		}
		case 'remove': {
			const profiles = { ...state.profiles };
			delete profiles[action.id];
			const ids = Object.keys(profiles);
			return { ...state, profiles, activeId: state.activeId === action.id ? (ids[0] || null) : state.activeId };
		}
		case 'active':
			return { ...state, activeId: action.id };
		case 'account':
			return { ...state, account: { enabled: !!action.enabled, consentAt: action.consentAt || 0 } };
		case 'merge':
			return { ...state, profiles: action.profiles, activeId: state.activeId && action.profiles[state.activeId] ? state.activeId : Object.keys(action.profiles)[0] || null };
		case 'backup':
			return { ...state, lastBackup: Date.now(), changes: 0 };
		default:
			return state;
	}
}

function Dialog({ title, children, onClose, t }) {
	const ref = useRef(null);
	useEffect(() => {
		// Önce yazılacak alan (ad, metin), yoksa ilk düğme odaklanır
		const first = ref.current && (ref.current.querySelector('.cv-dialog-body :is(input:not([type=checkbox]), textarea)') || ref.current.querySelector('button, input, [tabindex]'));
		if (first) first.focus();
		const onKey = (e) => { if (e.key === 'Escape') onClose(); };
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);
	return (
		<div class="cv-modal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
			<div class="cv-dialog" role="dialog" aria-modal="true" aria-labelledby="cv-dialog-title" ref={ref}>
				<div class="cv-dialog-head">
					<h2 id="cv-dialog-title">{title}</h2>
					<button type="button" class="cvb-icon" aria-label={t('close')} onClick={onClose}><Icon name="x" /></button>
				</div>
				<div class="cv-dialog-body">{children}</div>
			</div>
		</div>
	);
}

function ConsentDialog({ t, onAccept, onClose }) {
	const [ok, setOk] = useState(false);
	return (
		<Dialog title={t('consent.title')} onClose={onClose} t={t}>
			<p>{t('consent.p1')}</p>
			<p>{t('consent.p2')}</p>
			<p>{t('consent.p3')}</p>
			<label class="cvf cvf--check cv-consent-check">
				<input type="checkbox" checked={ok} onChange={e => setOk(e.currentTarget.checked)} />
				<span>{t('consent.check')}</span>
			</label>
			<div class="cv-dialog-actions">
				<button type="button" class="cvb cvb--ghost" onClick={onClose}>{t('consent.cancel')}</button>
				<button type="button" class="cvb cvb--primary" disabled={!ok} onClick={onAccept}>{t('consent.accept')}</button>
			</div>
		</Dialog>
	);
}

// CV hâlâ "Adsız CV" ise yazdırma, dışa aktarma ve hesaba kaydetmeden önce ad istenir
function NameDialog({ t, suggestion, onSave, onClose }) {
	const [name, setName] = useState(suggestion || '');
	const ok = name.trim() && !UNTITLED.includes(name.trim());
	return (
		<Dialog title={t('name.title')} onClose={onClose} t={t}>
			<form onSubmit={(e) => { e.preventDefault(); if (ok) onSave(name.trim().slice(0, 80)); }}>
				<p>{t('name.body')}</p>
				<div class="cvf cvf--wide">
					<label class="cvf-label" for="cv-name-input">{t('name.label')}</label>
					<input class="cvf-input" id="cv-name-input" value={name} maxLength={80} placeholder={t('name.placeholder')} autocomplete="off" data-bwignore data-1p-ignore data-lpignore="true" onInput={e => setName(e.currentTarget.value)} />
				</div>
				<div class="cv-dialog-actions">
					<button type="button" class="cvb cvb--ghost" onClick={onClose}>{t('consent.cancel')}</button>
					<button type="submit" class="cvb cvb--primary" disabled={!ok}>{t('name.save')}</button>
				</div>
			</form>
		</Dialog>
	);
}

// Yapay zekâ ile doldurma: komutu kopyala → kendi seçtiğin yapay zekâya yapıştır → cevabı geri yapıştır.
// Hiçbir şey sunucumuza ya da bir API'ye gitmez; metni yapay zekâya kişi kendisi gönderir.
function AIDialog({ t, initialMode, initialFile, profile, defaultLang, onCreate, onClose }) {
	const blank = isEmpty(profile);
	const [mode, setMode] = useState(blank ? 'new' : (initialMode || 'new'));
	const [lang, setLang] = useState(defaultLang);
	const [text, setText] = useState('');
	const [answer, setAnswer] = useState('');
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState('');
	const [reading, setReading] = useState('');
	const canCopy = mode === 'improve' || text.trim().length >= 20;
	const onFile = async (e) => {
		const file = e.currentTarget.files && e.currentTarget.files[0];
		e.currentTarget.value = '';
		if (!file) return;
		if (!isReadable(file)) { setReading(t('ai.fileType')); return; }
		setReading(t('ai.fileReading'));
		try {
			const got = await textFromFile(file);
			if (got.length < 40) { setReading(t('ai.fileEmpty')); return; }
			setText(got.slice(0, 20000));
			setCopied(false);
			setReading(t('ai.fileOk', file.name));
		} catch (err) {
			console.warn('[cv-yu] file', err);
			setReading(err.message === 'size' ? t('ai.fileSize') : t('ai.fileError'));
		}
	};
	// "İçe aktar"dan gelen PDF/TXT: pencere açılınca okunur ve 1. adıma yazılır
	useEffect(() => {
		if (initialFile) onFile({ currentTarget: { files: [initialFile], value: '' } });
	}, []);
	const copy = async () => {
		const value = buildPrompt({ mode, lang, text, profile });
		try {
			await navigator.clipboard.writeText(value);
		} catch (err) {
			// Pano izni yoksa eski yol
			const ta = document.createElement('textarea');
			ta.value = value;
			ta.setAttribute('readonly', '');
			ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy'); } finally { ta.remove(); }
		}
		setCopied(true);
	};
	const create = () => {
		try {
			onCreate(answer, mode === 'improve' ? profile.settings.lang : lang, mode);
		} catch (err) {
			setError(err.message === 'limit' ? t('profiles.limit', MAX_PROFILES) : t('ai.error'));
		}
	};
	return (
		<Dialog title={t('ai.title')} onClose={onClose} t={t}>
			{blank ? null : (
				<div class="cv-seg cv-ai-mode" role="group" aria-label={t('ai.title')}>
					{['new', 'improve'].map(k => (
						<button type="button" key={k} class={`cv-seg-btn ${mode === k ? 'is-on' : ''}`} aria-pressed={mode === k} onClick={() => { setMode(k); setCopied(false); setError(''); }}>{t(k === 'new' ? 'ai.modeNew' : 'ai.modeImprove')}</button>
					))}
				</div>
			)}
			<ol class="cv-ai-steps">
				<li>
					{mode === 'improve' ? <p>{t('ai.step1improve')}</p> : (
						<>
							<div class="cv-ai-head">
								<label class="cvf-label" for="cv-ai-text">{t('ai.step1')}</label>
								<div class="cv-seg cv-seg--mini" role="group" aria-label={t('ai.lang')} title={t('ai.lang')}>
									{[['tr', 'TR'], ['en', 'EN']].map(([k, label]) => (
										<button type="button" key={k} class={`cv-seg-btn ${lang === k ? 'is-on' : ''}`} aria-pressed={lang === k} onClick={() => { setLang(k); setCopied(false); }}>{label}</button>
									))}
								</div>
							</div>
							<textarea class="cvf-input cv-ai-text" id="cv-ai-text" rows={6} value={text} placeholder={t('ai.step1ph')} onInput={(e) => { setText(e.currentTarget.value); setCopied(false); }} />
							<div class="cv-ai-row">
								<label class="cvb cvb--secondary cvb--sm">
									<input type="file" accept=".pdf,.txt,application/pdf,text/plain" class="cv-visually-hidden" onChange={onFile} />
									<Icon name="upload" />{t('ai.file')}
								</label>
								<span class="cvf-hint" role="status">{reading || t('ai.fileHint')}</span>
							</div>
						</>
					)}
				</li>
				<li>
					<span class="cvf-label">{t('ai.step2')}</span>
					<div class="cv-ai-row">
						<button type="button" class={`cvb ${copied ? 'cvb--secondary' : 'cvb--primary'}`} disabled={!canCopy} onClick={copy}><Icon name={copied ? 'check' : 'copy'} />{copied ? t('ai.copied') : t('ai.copy')}</button>
						<span class="cvf-hint">{t('ai.step2hint')}</span>
					</div>
				</li>
				<li>
					<label class="cvf-label" for="cv-ai-answer">{t('ai.step3')}</label>
					<textarea class="cvf-input cv-ai-text" id="cv-ai-answer" rows={5} value={answer} placeholder={t('ai.step3ph')} onInput={(e) => { setAnswer(e.currentTarget.value); setError(''); }} />
					{error ? <p class="cv-ai-error" role="alert">{error}</p> : null}
				</li>
			</ol>
			<p class="cvf-hint cv-ai-privacy"><Icon name="shield" />{t('ai.privacy')}</p>
			<div class="cv-dialog-actions">
				<button type="button" class="cvb cvb--ghost" onClick={onClose}>{t('consent.cancel')}</button>
				<button type="button" class="cvb cvb--primary" disabled={!answer.trim()} onClick={create}><Icon name="sparkles" />{t('ai.create')}</button>
			</div>
		</Dialog>
	);
}

function ConfirmDialog({ t, title, body, confirmLabel, danger, onConfirm, onClose }) {
	return (
		<Dialog title={title} onClose={onClose} t={t}>
			<p>{body}</p>
			<div class="cv-dialog-actions">
				<button type="button" class="cvb cvb--ghost" onClick={onClose}>{t('consent.cancel')}</button>
				<button type="button" class={`cvb ${danger ? 'cvb--danger' : 'cvb--primary'}`} onClick={onConfirm}>{confirmLabel}</button>
			</div>
		</Dialog>
	);
}

function App({ ctx }) {
	const uiLang = uiLangOf(ctx.uiLang);
	const t = useMemo(() => makeT(uiLang), [uiLang]);
	const [state, dispatch] = useReducer(reducer, { profiles: {}, activeId: null, account: { enabled: false, consentAt: 0 }, lastBackup: 0, changes: 0, loaded: false });
	const [zoom, setZoom] = useState('fit');
	const [pageCount, setPageCount] = useState(1);
	const [tab, setTab] = useState('edit');
	const [menu, setMenu] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [dialog, setDialog] = useState(null);
	const [status, setStatus] = useState('');
	const [toast, setToast] = useState('');
	const dirty = useRef(new Set());
	const client = useMemo(() => api(ctx), [ctx]);
	const fileRef = useRef(null);

	const appRef = useRef(null);
	// Çalışma alanı ekranın kalanını doldurur: üst kenarının sayfadaki yerini ölç, yüksekliği CSS hesaplar
	useLayoutEffect(() => {
		const el = appRef.current;
		if (!el) return undefined;
		const measure = () => { el.style.setProperty('--cv-app-top', `${Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))}px`); };
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, [state.loaded]);

	const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); }, []);

	// İlk yükleme: cihazdaki kayıt; girişliyse ve daha önce onay verilmişse hesaptaki profillerle birleştir
	useEffect(() => {
		let local = ctx.initial || loadLocal(uiLang);
		if (!local || !Object.keys(local.profiles).length) {
			// İlk açılış: boş sayfa yerine örnek CV; kişi üstüne yazarak başlar
			const p = sampleProfile(t('profiles.untitled'), uiLang);
			local = { profiles: { [p.id]: p }, activeId: p.id, account: { enabled: false, consentAt: 0 }, lastBackup: Date.now(), changes: 0, ...(local || {}) };
			if (!Object.keys(local.profiles).length) local.profiles = { [p.id]: p };
			local.activeId = local.profiles[local.activeId] ? local.activeId : Object.keys(local.profiles)[0];
		}
		dispatch({ type: 'init', state: local });
		if (ctx.uid > 0) {
			client.list().then((res) => {
				if (!res) return;
				if (local.account.enabled || res.consentAt) {
					const profiles = merge(local.profiles, res.profiles || [], uiLang);
					const serverIds = new Set((res.profiles || []).map(p => p.id));
					Object.values(local.profiles).forEach((p) => { if (!serverIds.has(p.id)) dirty.current.add(p.id); });
					dispatch({ type: 'merge', profiles });
					dispatch({ type: 'account', enabled: true, consentAt: res.consentAt || local.account.consentAt });
				}
			}).catch(() => { /* sunucu yoksa cihazdaki kopyayla devam */ });
		}
	}, []);

	// Cihaza kayıt (kısa gecikmeyle)
	useEffect(() => {
		if (!state.loaded) return;
		const timer = setTimeout(() => saveLocal(state), 400);
		return () => clearTimeout(timer);
	}, [state]);

	// Hesaba kayıt: yalnızca onay verildiyse, değişen profiller
	useEffect(() => {
		if (!state.loaded || !state.account.enabled || !ctx.uid) return;
		if (!dirty.current.size) return;
		const timer = setTimeout(async () => {
			const ids = [...dirty.current];
			dirty.current.clear();
			setStatus('saving');
			try {
				for (const id of ids) {
					if (state.profiles[id]) await client.save(state.profiles[id]);
				}
				setStatus('saved');
			} catch (err) {
				ids.forEach(id => dirty.current.add(id));
				setStatus(`error:${err.message}`);
			}
		}, 1500);
		return () => clearTimeout(timer);
	}, [state.profiles, state.account.enabled]);

	const active = state.activeId ? state.profiles[state.activeId] : null;

	// Sol panel akordeon gibi çalışır: aynı anda tek kart açık, liste kısa kalır.
	// İlk açılışta kişisel bilgiler boşsa o açılır; doluysa hepsi kapalı başlar ve bölüm listesi görünür.
	const [openKey, setOpenKey] = useState(undefined);
	const sideRef = useRef(null);
	useEffect(() => {
		if (openKey !== undefined || !active) return;
		const name = active.data.personal.name;
		setOpenKey(name && name.trim() ? null : 'personal');
	}, [active, openKey]);
	const toggleOpen = useCallback(key => setOpenKey(k => (k === key ? null : key)), []);
	// Açılan kart görünür kalsın: üstteki uzun kart kapanınca ekrandan kaçarsa ya da çok aşağıdaysa panelin üstüne getir
	useLayoutEffect(() => {
		const side = sideRef.current;
		if (!side || !openKey) return;
		const card = side.querySelector(`[data-acc="${openKey}"]`);
		if (!card) return;
		const inPanel = getComputedStyle(side).overflowY !== 'visible' && side.scrollHeight > side.clientHeight;
		const top = card.getBoundingClientRect().top;
		if (inPanel) {
			const delta = top - side.getBoundingClientRect().top - 4;
			if (delta < 0 || delta > side.clientHeight * 0.4) side.scrollTop += delta;
		} else if (top < 64) {
			window.scrollBy(0, top - 64); // telefonda sayfa kayar; üstteki yapışkan sekmelerin altında kalsın
		}
	}, [openKey]);
	const setProfile = useCallback((profile) => { dirty.current.add(profile.id); dispatch({ type: 'profile', profile }); }, []);
	const update = useCallback(fn => setProfile({ ...active, data: fn(active.data) }), [active, setProfile]);
	const setSettings = patch => setProfile({ ...active, settings: { ...active.settings, ...patch } });
	const setTheme = patch => setSettings({ theme: { ...active.settings.theme, ...patch } });

	const addProfile = () => {
		if (Object.keys(state.profiles).length >= MAX_PROFILES) return notify(t('profiles.limit', MAX_PROFILES));
		const p = newProfile(t('profiles.untitled'), active ? active.settings.lang : uiLang);
		dirty.current.add(p.id);
		dispatch({ type: 'add', profiles: [p], activate: true });
	};
	const hasRoom = () => Object.keys(state.profiles).length < MAX_PROFILES;
	const openAI = mode => setDialog({ kind: 'ai', mode });
	// Yapay zekâ cevabından yeni CV: iyileştirme de yeni CV açar, mevcut CV'ye dokunmaz. Okunamazsa hata fırlatır (pencere gösterir).
	const createFromAI = (mode, text, lang) => {
		const improve = mode === 'improve';
		const p = profileFromAI(text, improve ? { lang, base: active, name: `${active.name} – YZ`.slice(0, 80) } : { lang });
		const person = p.data.personal.name.trim();
		if (!improve) p.name = person ? `${person} – CV`.slice(0, 80) : t('profiles.untitled');
		if (!improve && isEmpty(active)) {
			// Boş CV'den başlatıldıysa yeni CV açmak yerine onu doldur (ayarlar ve kimlik kalır)
			setProfile({ ...active, name: isUntitled(active.name) ? p.name : active.name, settings: { ...active.settings, lang: p.settings.lang }, data: p.data });
		} else {
			if (!hasRoom()) throw new Error('limit');
			dirty.current.add(p.id);
			dispatch({ type: 'add', profiles: [p], activate: true });
		}
		setDialog(null);
		notify(t('ai.done'));
	};
	const fillSample = () => setProfile({ ...active, data: sampleProfile(active.name, active.settings.lang).data });
	// İçe aktar: JSON doğrudan CV olur; PDF/TXT yapay zekâ ekranına metin olarak gider
	const onImportFile = (e) => {
		const file = e.currentTarget.files && e.currentTarget.files[0];
		if (file && isReadable(file)) {
			e.currentTarget.value = '';
			setDialog({ kind: 'ai', mode: 'new', file });
			return undefined;
		}
		return importJSON(e);
	};
	const copyProfile = () => {
		if (Object.keys(state.profiles).length >= MAX_PROFILES) return notify(t('profiles.limit', MAX_PROFILES));
		const p = normalize({ ...active, id: undefined, name: `${active.name} (2)` }, uiLang);
		dirty.current.add(p.id);
		dispatch({ type: 'add', profiles: [p], activate: true });
	};
	// Tek CV silinemez: kişi hiçbir zaman boş bir şablona düşmez
	const onlyOne = Object.keys(state.profiles).length <= 1;
	const removeProfile = () => onlyOne ? notify(t('profiles.deleteLast')) : setDialog({
		kind: 'confirm', title: t('profiles.delete'), body: t('profiles.deleteConfirm', active.name), confirmLabel: t('profiles.delete'), danger: true,
		onConfirm: async () => {
			setDialog(null);
			const id = active.id;
			dispatch({ type: 'remove', id });
			if (state.account.enabled && ctx.uid) { try { await client.remove(id); } catch (err) { notify(t('storage.error', err.message)); } }
		},
	});

	// Ad gerektiren işlemler: CV adsızsa önce ad sorulur, sonra işlem verilen adla sürer
	const withName = action => () => {
		if (!isUntitled(active.name)) return action(active.name);
		const person = active.data.personal.name.trim();
		return setDialog({
			kind: 'name',
			suggestion: person ? `${person} – CV` : '',
			onSave: (name) => {
				setDialog(null);
				setProfile({ ...active, name });
				action(name);
			},
		});
	};
	// Yazdırırken sayfa başlığı CV'nin adı olur: tarayıcı PDF'i bu adla kaydetmeyi önerir
	const printCV = withName((name) => {
		setTimeout(() => {
			const before = document.title;
			const restore = () => { document.title = before; window.removeEventListener('afterprint', restore); };
			document.title = name;
			window.addEventListener('afterprint', restore);
			window.print();
		}, 60);
	});
	const exportJSON = withName((name) => {
		downloadJSON(`${(name || 'cv').replace(/[^\w\-]+/g, '_')}.json`, { format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), profiles: [{ ...active, name }] });
		dispatch({ type: 'backup' });
	});
	const importJSON = async (e) => {
		const file = e.currentTarget.files && e.currentTarget.files[0];
		e.currentTarget.value = '';
		if (!file) return;
		try {
			const room = MAX_PROFILES - Object.keys(state.profiles).length;
			const imported = readImport(await file.text(), uiLang).map(p => normalize({ ...p, id: state.profiles[p.id] ? undefined : p.id }, uiLang)).slice(0, Math.max(0, room));
			if (!imported.length) return notify(t('profiles.limit', MAX_PROFILES));
			imported.forEach(p => dirty.current.add(p.id));
			dispatch({ type: 'add', profiles: imported, activate: true });
			notify(t('toolbar.importOk', imported.length));
		} catch (err) {
			notify(t('toolbar.importError'));
		}
	};

	const enableAccount = withName(() => setDialog({ kind: 'consent', onAccept: () => {
		setDialog(null);
		Object.keys(state.profiles).forEach(id => dirty.current.add(id));
		dispatch({ type: 'account', enabled: true, consentAt: Date.now() });
	} }));
	const disableAccount = () => { dispatch({ type: 'account', enabled: false, consentAt: state.account.consentAt }); notify(t('storage.disabledInfo')); };
	const deleteAccountData = () => setDialog({
		kind: 'confirm', title: t('storage.delete'), body: t('storage.deleteConfirm'), confirmLabel: t('storage.delete'), danger: true,
		onConfirm: async () => {
			setDialog(null);
			try {
				await client.purge();
				dispatch({ type: 'account', enabled: false, consentAt: 0 });
				setStatus('');
				notify(t('storage.deleted'));
			} catch (err) {
				notify(t('storage.error', err.message));
			}
		},
	});

	useEffect(() => {
		if (!menu) return;
		const close = (e) => { if (!e.target.closest('.cv-menu-wrap')) setMenu(false); };
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	}, [menu]);
	useEffect(() => {
		if (!renaming) return;
		const close = (e) => { if (!e.target.closest('.cv-rename') && !e.target.closest('[aria-label="' + t('profiles.rename') + '"]')) setRenaming(false); };
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	}, [renaming]);

	if (!state.loaded || !active) return <div class="cv-yu-loading" role="status">…</div>;

	const docLang = active.settings.lang;
	const pageLabels = { page: n => t('page.n', n), continues: n => t('page.continues', n) };
	// Yapay zekâ / İçe aktar / Dışa aktar: masaüstünde önizleme çubuğunda (Yazdır'ın altında), telefonda düzenleme sekmesinin üstünde
	const actions = where => (
		<div class={`cv-actions ${where}`}>
			<button type="button" class="cvb cvb--secondary cv-action-ai" title={t('actions.aiHint')} onClick={() => openAI(isEmpty(active) ? 'new' : 'improve')}><Icon name="sparkles" /><span>{t('actions.ai')}</span></button>
			<button type="button" class="cvb cvb--secondary" title={t('actions.importHint')} onClick={() => fileRef.current.click()}><Icon name="upload" /><span>{t('actions.import')}</span></button>
			<button type="button" class="cvb cvb--secondary" title={t('actions.exportHint')} onClick={exportJSON}><Icon name="download" /><span>{t('actions.export')}</span></button>
		</div>
	);
	const needsBackup = !state.account.enabled && state.changes >= BACKUP_AFTER_CHANGES && Date.now() - state.lastBackup > BACKUP_AFTER_MS;
	const statusText = status === 'saving' ? t('storage.saving') : status === 'saved' ? t('storage.saved') : status.startsWith('error:') ? t('storage.error', status.slice(6)) : '';

	return (
		<div class={`cv-app cv-app--${tab}`} ref={appRef}>
			<div class="cv-top">
				<div class="cv-top-left">
					<label class="cv-top-field">
						<span class="cv-visually-hidden">{t('profiles.label')}</span>
						<select class="cvf-input cvf-input--sm" value={active.id} onChange={e => dispatch({ type: 'active', id: e.currentTarget.value })} aria-label={t('profiles.label')}>
							{Object.values(state.profiles).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
						</select>
					</label>
					<div class="cv-menu-wrap">
						<button type="button" class="cvb-icon" aria-label={t('profiles.rename')} title={t('profiles.rename')} aria-expanded={renaming} onClick={() => setRenaming(r => !r)}><Icon name="pencil" /></button>
						{renaming ? (
							<form class="cv-menu cv-rename" onSubmit={(e) => { e.preventDefault(); setRenaming(false); }}>
								<label class="cvf-label" for={`${active.id}-rename`}>{t('profiles.renamePrompt')}</label>
								<div class="cv-rename-row">
									<input class="cvf-input" id={`${active.id}-rename`} value={active.name} maxLength={80} autoFocus onInput={e => setProfile({ ...active, name: e.currentTarget.value })} onKeyDown={e => { if (e.key === 'Escape') setRenaming(false); }} />
									<button type="submit" class="cvb cvb--primary cvb--sm">{t('close')}</button>
								</div>
							</form>
						) : null}
					</div>
					<button type="button" class="cvb-icon" aria-label={t('profiles.new')} title={t('profiles.new')} onClick={addProfile}><Icon name="plus" /></button>
					<button type="button" class="cvb-icon" aria-label={t('profiles.copy')} title={t('profiles.copy')} onClick={copyProfile}><Icon name="copy" /></button>
					<button type="button" class={`cvb-icon cvb-icon--danger ${onlyOne ? 'is-disabled' : ''}`} aria-label={t('profiles.delete')} aria-disabled={onlyOne} title={onlyOne ? t('profiles.deleteLast') : t('profiles.delete')} onClick={removeProfile}><Icon name="trash" /></button>
				</div>
				<div class="cv-top-mid">
					<fieldset class="cv-choice cv-choice--inline">
						<legend class="cv-visually-hidden">{t('template.label')}</legend>
						<span class="cv-top-label" aria-hidden="true">{t('template.label')}</span>
						<div class="cv-seg" role="group">
							{TEMPLATES.map(k => (
								<label class={`cv-seg-item ${active.settings.template === k ? 'is-on' : ''}`} key={k}>
									<input type="radio" name={`${active.id}-template`} value={k} checked={active.settings.template === k} onChange={() => setProfile({ ...active, settings: switchTemplate(active.settings, k) })} />
									<span>{t(`template.${k}`)}</span>
								</label>
							))}
						</div>
					</fieldset>
					<fieldset class="cv-choice cv-choice--inline" title={t('docLang.help')}>
						<legend class="cv-visually-hidden">{t('docLang.label')}</legend>
						<span class="cv-top-label" aria-hidden="true">{t('docLang.label')}</span>
						<div class="cv-seg" role="group">
							{[['tr', 'TR'], ['en', 'EN']].map(([k, label]) => (
								<label class={`cv-seg-item ${docLang === k ? 'is-on' : ''}`} key={k}>
									<input type="radio" name={`${active.id}-lang`} value={k} checked={docLang === k} onChange={() => setSettings({ lang: k })} />
									<span>{label}</span>
								</label>
							))}
						</div>
					</fieldset>
				</div>
				<div class="cv-top-right">
					<span class={`cv-status ${status.startsWith('error') ? 'is-error' : ''}`} role="status" aria-live="polite">
						<Icon name={state.account.enabled ? 'cloud' : 'device'} />
						<span>{statusText || (state.account.enabled ? t('storage.account') : t('storage.device'))}</span>
					</span>
					<button type="button" class="cvb cvb--primary" title={t('toolbar.printHint')} onClick={printCV}><Icon name="printer" />{t('toolbar.print')}</button>
					<div class="cv-menu-wrap">
						<button type="button" class="cvb-icon" aria-label={t('toolbar.more')} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}><Icon name="more" /></button>
						{menu ? (
							<div class="cv-menu" role="menu">
								<div class="cv-menu-title">{t('storage.title')}</div>
								{ctx.uid > 0 ? (
									state.account.enabled ?
										<button type="button" role="menuitem" onClick={() => { setMenu(false); disableAccount(); }}><Icon name="device" />{t('storage.disable')}</button> :
										<button type="button" role="menuitem" onClick={() => { setMenu(false); enableAccount(); }}><Icon name="cloud" />{t('storage.enable')}</button>
								) : <div class="cv-menu-hint">{t('storage.loginHint')}</div>}
								{ctx.uid > 0 ? <button type="button" role="menuitem" class="is-danger" onClick={() => { setMenu(false); deleteAccountData(); }}><Icon name="trash" />{t('storage.delete')}</button> : null}
								<div class="cv-menu-sep" role="separator" />
								<button type="button" role="menuitem" onClick={() => { setMenu(false); setDialog({ kind: 'privacy' }); }}><Icon name="shield" />{t('privacy.link')}</button>
							</div>
						) : null}
					</div>
					<input type="file" accept=".json,.pdf,.txt,application/json,application/pdf,text/plain" class="cv-visually-hidden" ref={fileRef} onChange={onImportFile} tabIndex={-1} aria-hidden="true" />
				</div>
			</div>

			<div class="cv-tabs" role="tablist">
				<button type="button" role="tab" aria-selected={tab === 'edit'} class={tab === 'edit' ? 'is-on' : ''} onClick={() => setTab('edit')}><Icon name="edit" />{t('tabs.edit')}</button>
				<button type="button" role="tab" aria-selected={tab === 'preview'} class={tab === 'preview' ? 'is-on' : ''} onClick={() => setTab('preview')}><Icon name="file" />{t('tabs.preview')} · {t('toolbar.pages', pageCount)}</button>
			</div>

			<div class="cv-body">
				<aside class="cv-side" data-sort-scroll ref={sideRef}>
					{actions('cv-actions--side')}
					{isEmpty(active) ? (
						<div class="cv-callout">
							<p><strong>{t('empty.calloutTitle')}</strong>{t('empty.calloutBody')}</p>
							<div class="cv-callout-actions">
								<button type="button" class="cvb cvb--primary cvb--sm" onClick={fillSample}><Icon name="file" />{t('empty.fillSample')}</button>
								<button type="button" class="cvb cvb--secondary cvb--sm" onClick={() => openAI('new')}><Icon name="sparkles" />{t('empty.fillAI')}</button>
							</div>
						</div>
					) : null}
					{needsBackup ? <div class="cv-banner"><Icon name="download" /><span>{t('storage.backupHint')}</span><button type="button" class="cvb cvb--sm cvb--secondary" onClick={exportJSON}>{t('toolbar.export')}</button></div> : null}
					<section class="cv-card" data-acc="theme">
						<div class="cv-card-head">
							<button type="button" class="cv-card-toggle" aria-expanded={openKey === 'theme'} aria-controls={`${active.id}-theme`} onClick={() => toggleOpen('theme')}>
								<Icon name={openKey === 'theme' ? 'chevron-down' : 'chevron-right'} />
								<span class="cv-card-title">{t('theme.title')}</span>
							</button>
						</div>
						{openKey === 'theme' ? <div class="cv-card-body" id={`${active.id}-theme`}><ThemePanel t={t} profile={active} setTheme={setTheme} /></div> : null}
					</section>
					<Editor t={t} profile={active} update={update} openKey={openKey} onToggle={toggleOpen} />
				</aside>

				<main class="cv-main">
					<div class="cv-preview-bar">
						<div class="cv-seg cv-seg--zoom" role="group" aria-label="Zoom">
							<button type="button" class={`cv-seg-btn ${zoom === 'fit' ? 'is-on' : ''}`} aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}><Icon name="fit" />{t('toolbar.fit')}</button>
							<button type="button" class={`cv-seg-btn ${zoom === 1 ? 'is-on' : ''}`} aria-pressed={zoom === 1} onClick={() => setZoom(1)}><Icon name="zoom-in" />{t('toolbar.zoom100')}</button>
						</div>
						<span class={`cv-pagecount ${pageCount > 1 ? 'is-over' : ''}`} role="status">{pageCount > 1 ? <Icon name="info" /> : null}{pageCount > 1 ? t('toolbar.overflow', pageCount) : t('toolbar.pages', pageCount)}</span>
						{actions('cv-actions--bar')}
					</div>
					<PreviewScroller zoom={zoom} pageCount={pageCount}>
						<PreviewBoundary resetKey={active} message={t('preview.error')}>
							<Preview profile={active} zoom={zoom} onLayout={setPageCount} docLang={docLang} emptyHint={[t('empty.title'), t('empty.body')]} pageLabels={pageLabels} />
						</PreviewBoundary>
					</PreviewScroller>
				</main>
			</div>

			{toast ? <div class="cv-toast" role="status">{toast}</div> : null}
			{dialog && dialog.kind === 'consent' ? <ConsentDialog t={t} onAccept={dialog.onAccept} onClose={() => setDialog(null)} /> : null}
			{dialog && dialog.kind === 'ai' ? <AIDialog t={t} initialMode={dialog.mode} initialFile={dialog.file} profile={active} defaultLang={active.settings.lang} onCreate={(text, lang, mode) => createFromAI(mode, text, lang)} onClose={() => setDialog(null)} /> : null}
			{dialog && dialog.kind === 'name' ? <NameDialog t={t} suggestion={dialog.suggestion} onSave={dialog.onSave} onClose={() => setDialog(null)} /> : null}
			{dialog && dialog.kind === 'confirm' ? <ConfirmDialog t={t} title={dialog.title} body={dialog.body} confirmLabel={dialog.confirmLabel} danger={dialog.danger} onConfirm={dialog.onConfirm} onClose={() => setDialog(null)} /> : null}
			{dialog && dialog.kind === 'privacy' ? (
				<Dialog title={t('privacy.title')} onClose={() => setDialog(null)} t={t}>
					<p>{t('privacy.p1')}</p><p>{t('privacy.p2')}</p><p>{t('privacy.p3')}</p><p class="cvf-hint">{t('privacy.p4')}</p>
				</Dialog>
			) : null}
		</div>
	);
}

// Sayfaları alana sığdırır ya da %100 gösterir; ölçek değişince kaydırma alanının yüksekliği de değişir
function PreviewScroller({ zoom, pageCount, children }) {
	const ref = useRef(null);
	const [scale, setScale] = useState(1);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const calc = () => {
			if (el.clientWidth < 100) return; // gizliyken ölçme
			setScale(zoom === 'fit' ? Math.min(1, (el.clientWidth - 32) / 794) : zoom);
		};
		calc();
		const ro = new ResizeObserver(calc);
		ro.observe(el);
		return () => ro.disconnect();
	}, [zoom]);
	const height = Math.ceil(pageCount * (1123 + 24) * scale) + 24;
	return (
		<div class="cv-preview" ref={ref}>
			<div class="cv-zoom" style={{ height: `${height}px` }}>
				<div class="cv-zoom-inner" style={{ transform: `scale(${scale})` }}>{children}</div>
			</div>
		</div>
	);
}

let mountedRoot = null;
window.YuCV = {
	mount(root, ctx) {
		mountedRoot = root;
		root.classList.add('cv-yu-mounted');
		render(<App ctx={ctx} />, root);
	},
	unmount() {
		if (mountedRoot) {
			render(null, mountedRoot);
			mountedRoot = null;
		}
	},
};
