// Uygulama kökü: durum, kayıt (cihaz / hesap), araç çubuğu, düzenleyici ve önizleme. window.YuCV.mount/unmount ile bağlanır.
import { render } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { makeT, uiLangOf } from './i18n.js';
import { EXPORT_FORMAT, TEMPLATES, newProfile, normalize, parseImport, switchTemplate } from './model.js';
import { api, clearLocal, downloadJSON, loadLocal, merge, saveLocal } from './storage.js';
import { Editor, Field } from './ui/Editor.jsx';
import { ThemePanel } from './ui/ThemePanel.jsx';
import { Preview, PreviewBoundary } from './ui/Preview.jsx';
import { Icon } from './ui/icons.jsx';

const MAX_PROFILES = 5;
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
		const first = ref.current && ref.current.querySelector('button, input, [tabindex]');
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
	const [themeOpen, setThemeOpen] = useState(false);
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
			const p = newProfile(t('profiles.untitled'), uiLang);
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
	const copyProfile = () => {
		if (Object.keys(state.profiles).length >= MAX_PROFILES) return notify(t('profiles.limit', MAX_PROFILES));
		const p = normalize({ ...active, id: undefined, name: `${active.name} (2)` }, uiLang);
		dirty.current.add(p.id);
		dispatch({ type: 'add', profiles: [p], activate: true });
	};
	const removeProfile = () => setDialog({
		kind: 'confirm', title: t('profiles.delete'), body: t('profiles.deleteConfirm', active.name), confirmLabel: t('profiles.delete'), danger: true,
		onConfirm: async () => {
			setDialog(null);
			const id = active.id;
			dispatch({ type: 'remove', id });
			if (Object.keys(state.profiles).length === 1) addProfile();
			if (state.account.enabled && ctx.uid) { try { await client.remove(id); } catch (err) { notify(t('storage.error', err.message)); } }
		},
	});

	const exportJSON = () => {
		downloadJSON(`${(active.name || 'cv').replace(/[^\w\-]+/g, '_')}.json`, { format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), profiles: [active] });
		dispatch({ type: 'backup' });
	};
	const importJSON = async (e) => {
		const file = e.currentTarget.files && e.currentTarget.files[0];
		e.currentTarget.value = '';
		if (!file) return;
		try {
			const room = MAX_PROFILES - Object.keys(state.profiles).length;
			const imported = parseImport(await file.text(), uiLang).map(p => normalize({ ...p, id: state.profiles[p.id] ? undefined : p.id }, uiLang)).slice(0, Math.max(0, room));
			if (!imported.length) return notify(t('profiles.limit', MAX_PROFILES));
			imported.forEach(p => dirty.current.add(p.id));
			dispatch({ type: 'add', profiles: imported, activate: true });
			notify(t('toolbar.importOk', imported.length));
		} catch (err) {
			notify(t('toolbar.importError'));
		}
	};

	const enableAccount = () => setDialog({ kind: 'consent', onAccept: () => {
		setDialog(null);
		Object.keys(state.profiles).forEach(id => dirty.current.add(id));
		dispatch({ type: 'account', enabled: true, consentAt: Date.now() });
	} });
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
					<button type="button" class="cvb-icon cvb-icon--danger" aria-label={t('profiles.delete')} title={t('profiles.delete')} onClick={removeProfile}><Icon name="trash" /></button>
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
					<button type="button" class="cvb cvb--primary" onClick={() => window.print()}><Icon name="printer" />{t('toolbar.print')}</button>
					<div class="cv-menu-wrap">
						<button type="button" class="cvb-icon" aria-label={t('toolbar.more')} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}><Icon name="more" /></button>
						{menu ? (
							<div class="cv-menu" role="menu">
								<button type="button" role="menuitem" onClick={() => { setMenu(false); exportJSON(); }}><Icon name="download" />{t('toolbar.export')}</button>
								<button type="button" role="menuitem" onClick={() => { setMenu(false); fileRef.current.click(); }}><Icon name="upload" />{t('toolbar.import')}</button>
								<div class="cv-menu-sep" role="separator" />
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
					<input type="file" accept="application/json,.json" class="cv-visually-hidden" ref={fileRef} onChange={importJSON} tabIndex={-1} aria-hidden="true" />
				</div>
			</div>

			<div class="cv-tabs" role="tablist">
				<button type="button" role="tab" aria-selected={tab === 'edit'} class={tab === 'edit' ? 'is-on' : ''} onClick={() => setTab('edit')}><Icon name="edit" />{t('tabs.edit')}</button>
				<button type="button" role="tab" aria-selected={tab === 'preview'} class={tab === 'preview' ? 'is-on' : ''} onClick={() => setTab('preview')}><Icon name="file" />{t('tabs.preview')} · {t('toolbar.pages', pageCount)}</button>
			</div>

			<div class="cv-body">
				<aside class="cv-side" data-sort-scroll>
					{needsBackup ? <div class="cv-banner"><Icon name="download" /><span>{t('storage.backupHint')}</span><button type="button" class="cvb cvb--sm cvb--secondary" onClick={exportJSON}>{t('toolbar.export')}</button></div> : null}
					<section class="cv-card">
						<div class="cv-card-head">
							<button type="button" class="cv-card-toggle" aria-expanded={themeOpen} aria-controls={`${active.id}-theme`} onClick={() => setThemeOpen(o => !o)}>
								<Icon name={themeOpen ? 'chevron-down' : 'chevron-right'} />
								<span class="cv-card-title">{t('theme.title')}</span>
							</button>
						</div>
						{themeOpen ? <div class="cv-card-body" id={`${active.id}-theme`}><ThemePanel t={t} profile={active} setTheme={setTheme} /></div> : null}
					</section>
					<Editor t={t} profile={active} update={update} />
				</aside>

				<main class="cv-main">
					<div class="cv-preview-bar">
						<div class="cv-seg cv-seg--zoom" role="group" aria-label="Zoom">
							<button type="button" class={`cv-seg-btn ${zoom === 'fit' ? 'is-on' : ''}`} aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}><Icon name="fit" />{t('toolbar.fit')}</button>
							<button type="button" class={`cv-seg-btn ${zoom === 1 ? 'is-on' : ''}`} aria-pressed={zoom === 1} onClick={() => setZoom(1)}><Icon name="zoom-in" />{t('toolbar.zoom100')}</button>
						</div>
						<span class={`cv-pagecount ${pageCount > 1 ? 'is-over' : ''}`} role="status">{pageCount > 1 ? <Icon name="info" /> : null}{pageCount > 1 ? t('toolbar.overflow', pageCount) : t('toolbar.pages', pageCount)}</span>
						<span class="cv-print-hint">{t('toolbar.printHint')}</span>
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
