// Görünüm paneli: tek sayfaya sığdırma, renkler, yazı tipi, boyutlar ve ince ayar, bölüm başlığı stili, ikonlar, fotoğraf
import { FINE, FONTS, PALETTE, fontStack, themeMetrics } from '../model.js';
import { Icon } from './icons.jsx';

// İnce ayar değerlerinin ekranda yazılışı: yazı ve aralık punto, kenar boşluğu milimetre (A4'te 1 px = 0,75 pt = 0,2646 mm)
const FINE_ROWS = [
	['sizePx', 'theme.size', (v, n) => `${n(v * 0.75, 1)} pt`],
	['lineHeight', 'theme.spacing', (v, n) => n(v, 2)],
	['gapPx', 'theme.gap', (v, n) => `${n(v * 0.75, 1)} pt`],
	['marginPx', 'theme.margins', (v, n) => `${n(v * 0.2646, 0)} mm`],
];

function Choice({ t, label, name, value, options, onChange }) {
	return (
		<fieldset class="cv-choice">
			<legend class="cvf-label">{label}</legend>
			<div class="cv-seg" role="group">
				{options.map(o => (
					<label class={`cv-seg-item ${value === o.value ? 'is-on' : ''}`} key={o.value}>
						<input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
						<span>{o.label}</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

export function ThemePanel({ t, profile, setTheme, uiLang, pageCount, onFit }) {
	const th = profile.settings.theme;
	const metrics = themeMetrics(th);
	const fine = key => Number.isFinite(th[key]);
	const number = (v, digits) => v.toLocaleString(uiLang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
	const resetFine = () => setTheme(Object.fromEntries(Object.keys(FINE).map(key => [key, undefined])));
	const sml = key => [{ value: 's', label: t('theme.s') }, { value: 'm', label: t('theme.m') }, { value: 'l', label: t('theme.l') }].map(o => ({ ...o, name: key }));
	const uid = profile.id;
	return (
		<div class="cv-theme">
			<div class="cv-fit">
				<button type="button" class="cvb cvb--secondary" disabled={pageCount <= 1} onClick={onFit}><Icon name="shrink" />{t('theme.fit')}</button>
				<p class="cvf-hint">{pageCount > 1 ? t('theme.fit.hint', pageCount) : t('theme.fit.ok')}</p>
			</div>
			<fieldset class="cv-choice">
				<legend class="cvf-label">{t('theme.colors')}</legend>
				<div class="cv-swatches" role="group">
					{PALETTE.map((c, i) => {
						const on = th.primary === c.primary && th.accent === c.accent;
						return (
							<label class={`cv-swatch ${on ? 'is-on' : ''}`} key={i} title={`${c.primary} / ${c.accent}`}>
								<input type="radio" name={`${uid}-palette`} checked={on} onChange={() => setTheme({ primary: c.primary, accent: c.accent })} aria-label={`${t('theme.colors')} ${i + 1}: ${c.primary} ${c.accent}`} />
								<span class="cv-swatch-a" style={{ background: c.primary }} /><span class="cv-swatch-b" style={{ background: c.accent }} />
							</label>
						);
					})}
				</div>
				<div class="cv-fields cv-fields--inline">
					<div class="cvf">
						<label class="cvf-label" for={`${uid}-primary`}>{t('theme.primary')}</label>
						<input class="cvf-color" id={`${uid}-primary`} type="color" value={th.primary} onInput={e => setTheme({ primary: e.currentTarget.value })} />
					</div>
					<div class="cvf">
						<label class="cvf-label" for={`${uid}-accent`}>{t('theme.accent')}</label>
						<input class="cvf-color" id={`${uid}-accent`} type="color" value={th.accent} onInput={e => setTheme({ accent: e.currentTarget.value })} />
					</div>
				</div>
			</fieldset>
			<div class="cvf cvf--wide">
				<label class="cvf-label" for={`${uid}-font`}>{t('theme.font')}</label>
				<select class="cvf-input" id={`${uid}-font`} value={th.font} onChange={e => setTheme({ font: e.currentTarget.value })}>
					{['sans', 'serif'].map(kind => (
						<optgroup key={kind} label={t(`theme.font.${kind}Group`)}>
							{FONTS.filter(f => f.kind === kind).map(f => <option key={f.key} value={f.key} style={{ fontFamily: fontStack(f.key) }}>{f.family}</option>)}
						</optgroup>
					))}
				</select>
			</div>
			<Choice t={t} label={t('theme.size')} name={`${uid}-size`} value={fine('sizePx') ? null : th.size} options={sml('size')} onChange={v => setTheme({ size: v, sizePx: undefined })} />
			<Choice t={t} label={t('theme.spacing')} name={`${uid}-spacing`} value={fine('lineHeight') ? null : th.spacing} options={sml('spacing')} onChange={v => setTheme({ spacing: v, lineHeight: undefined })} />
			<Choice t={t} label={t('theme.gap')} name={`${uid}-gap`} value={fine('gapPx') ? null : th.gap} options={sml('gap')} onChange={v => setTheme({ gap: v, gapPx: undefined })} />
			<Choice t={t} label={t('theme.margins')} name={`${uid}-margins`} value={fine('marginPx') ? null : th.margins} options={sml('margins')} onChange={v => setTheme({ margins: v, marginPx: undefined })} />
			{/* İnce ayar: hazır seçeneklerin arasındaki ve dışındaki değerler. Hazır seçeneğe basınca o ölçünün ince ayarı kalkar. */}
			<fieldset class="cv-choice cv-fine">
				<legend class="cvf-label">{t('theme.fine')}</legend>
				{FINE_ROWS.map(([key, label, format]) => (
					<div class="cv-fine-row" key={key}>
						<label class="cv-fine-label" for={`${uid}-${key}`}>{t(label)}</label>
						<output class={`cv-fine-value ${fine(key) ? 'is-set' : ''}`} for={`${uid}-${key}`}>{format(metrics[key], number)}</output>
						<input class="cv-range" id={`${uid}-${key}`} type="range" min={FINE[key].min} max={FINE[key].max} step={FINE[key].step} value={metrics[key]}
							style={{ '--fill': `${((metrics[key] - FINE[key].min) / (FINE[key].max - FINE[key].min)) * 100}%` }}
							aria-valuetext={format(metrics[key], number)} onInput={e => setTheme({ [key]: Number(e.currentTarget.value) })} />
					</div>
				))}
				{Object.keys(FINE).some(fine) ? <button type="button" class="cvb cvb--ghost cvb--sm" onClick={resetFine}>{t('theme.fine.reset')}</button> : <p class="cvf-hint">{t('theme.fine.hint')}</p>}
			</fieldset>
			<Choice t={t} label={t('theme.titleStyle')} name={`${uid}-title`} value={th.titleStyle} options={[{ value: 'caps', label: t('theme.caps') }, { value: 'capitalize', label: t('theme.capitalize') }, { value: 'normal', label: t('theme.normal') }]} onChange={v => setTheme({ titleStyle: v })} />
			<fieldset class="cv-choice">
				<legend class="cvf-label">{t('theme.photo')}</legend>
				<label class="cvf cvf--check">
					<input type="checkbox" checked={th.photo !== false} onChange={e => setTheme({ photo: e.currentTarget.checked })} />
					<span>{t('theme.photo.show')}</span>
				</label>
				{th.photo !== false ? (
					<>
						<Choice t={t} label={t('theme.photo.size')} name={`${uid}-photo-size`} value={th.photoSize} options={sml('photoSize')} onChange={v => setTheme({ photoSize: v })} />
						<Choice t={t} label={t('theme.photo.shape')} name={`${uid}-photo`} value={th.photoShape} options={[{ value: 'circle', label: t('theme.circle') }, { value: 'rounded', label: t('theme.rounded') }, { value: 'square', label: t('theme.square') }]} onChange={v => setTheme({ photoShape: v })} />
					</>
				) : null}
			</fieldset>
			<label class="cvf cvf--check">
				<input type="checkbox" checked={!!th.icons} onChange={e => setTheme({ icons: e.currentTarget.checked })} />
				<span>{t('theme.icons')}</span>
			</label>
		</div>
	);
}
