// Görünüm paneli: renkler, yazı tipi, boyutlar, bölüm başlığı stili, ikonlar, fotoğraf
import { PALETTE } from '../model.js';

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

export function ThemePanel({ t, profile, setTheme }) {
	const th = profile.settings.theme;
	const sml = key => [{ value: 's', label: t('theme.s') }, { value: 'm', label: t('theme.m') }, { value: 'l', label: t('theme.l') }].map(o => ({ ...o, name: key }));
	const uid = profile.id;
	return (
		<div class="cv-theme">
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
					<option value="inter">{t('theme.font.inter')}</option>
					<option value="sans">{t('theme.font.sans')}</option>
					<option value="serif">{t('theme.font.serif')}</option>
				</select>
			</div>
			<Choice t={t} label={t('theme.size')} name={`${uid}-size`} value={th.size} options={sml('size')} onChange={v => setTheme({ size: v })} />
			<Choice t={t} label={t('theme.spacing')} name={`${uid}-spacing`} value={th.spacing} options={sml('spacing')} onChange={v => setTheme({ spacing: v })} />
			<Choice t={t} label={t('theme.margins')} name={`${uid}-margins`} value={th.margins} options={sml('margins')} onChange={v => setTheme({ margins: v })} />
			<Choice t={t} label={t('theme.titleStyle')} name={`${uid}-title`} value={th.titleStyle} options={[{ value: 'caps', label: t('theme.caps') }, { value: 'normal', label: t('theme.normal') }]} onChange={v => setTheme({ titleStyle: v })} />
			<Choice t={t} label={t('theme.photo')} name={`${uid}-photo`} value={th.photoShape} options={[{ value: 'circle', label: t('theme.circle') }, { value: 'rounded', label: t('theme.rounded') }, { value: 'square', label: t('theme.square') }]} onChange={v => setTheme({ photoShape: v })} />
			<label class="cvf cvf--check">
				<input type="checkbox" checked={!!th.icons} onChange={e => setTheme({ icons: e.currentTarget.checked })} />
				<span>{t('theme.icons')}</span>
			</label>
		</div>
	);
}
