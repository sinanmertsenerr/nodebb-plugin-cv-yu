// Kayıt: varsayılan olarak yalnızca bu cihaz (localStorage). Kullanıcı açık onay verirse hesapta da saklanır.
import { normalize } from './model.js';

const KEY = 'cv-yu:v1';

export function loadLocal(fallbackLang) {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
		if (!raw || typeof raw !== 'object') {
			return null;
		}
		const profiles = {};
		Object.values(raw.profiles || {}).forEach((p) => {
			const n = normalize(p, fallbackLang);
			profiles[n.id] = n;
		});
		return {
			profiles,
			activeId: raw.activeId && profiles[raw.activeId] ? raw.activeId : Object.keys(profiles)[0] || null,
			account: raw.account && raw.account.enabled ? { enabled: true, consentAt: raw.account.consentAt || 0 } : { enabled: false, consentAt: 0 },
			lastBackup: Number.isFinite(raw.lastBackup) ? raw.lastBackup : 0,
			changes: Number.isFinite(raw.changes) ? raw.changes : 0,
		};
	} catch (err) {
		return null;
	}
}

export function saveLocal(state) {
	try {
		localStorage.setItem(KEY, JSON.stringify({
			profiles: state.profiles,
			activeId: state.activeId,
			account: state.account,
			lastBackup: state.lastBackup,
			changes: state.changes,
		}));
		return true;
	} catch (err) {
		return false;
	}
}

export function clearLocal() {
	try {
		localStorage.removeItem(KEY);
	} catch (err) { /* özel mod */ }
}

// Hesap API'si: NodeBB yazma API'si, CSRF başlığıyla
export function api(ctx) {
	const base = `${ctx.relativePath}/api/v3/plugins/cv-yu`;
	async function call(method, path, body, opts = {}) {
		const text = body ? JSON.stringify(body) : undefined;
		const res = await fetch(base + path, {
			method,
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json', 'x-csrf-token': ctx.csrf, accept: 'application/json' },
			body: text,
			// Sekme kapanırken de gitsin; tarayıcılar keepalive gövdesini ~64 KB ile sınırlar
			keepalive: !!opts.keepalive && (!text || text.length < 60000),
		});
		let json = null;
		try {
			json = await res.json();
		} catch (err) { /* boş gövde */ }
		if (!res.ok) {
			const msg = json && json.status && json.status.message ? json.status.message : `HTTP ${res.status}`;
			throw new Error(msg);
		}
		return json ? json.response : null;
	}
	return {
		list: () => call('GET', '/profiles'),
		// Fotoğraf yalnızca değiştiğinde gönderilir; gönderilmezse sunucudaki fotoğraf olduğu gibi kalır
		save: (profile, { photo = true, keepalive = false } = {}) => {
			let body = profile;
			if (!photo) {
				const personal = { ...profile.data.personal };
				delete personal.photo;
				body = { ...profile, data: { ...profile.data, personal } };
			}
			return call('PUT', `/profiles/${encodeURIComponent(profile.id)}`, { profile: body, consent: true }, { keepalive });
		},
		remove: id => call('DELETE', `/profiles/${encodeURIComponent(id)}`),
		purge: () => call('DELETE', '/profiles'),
	};
}

// Cihazdaki ve hesaptaki profilleri birleştirir: aynı kimlikte yeni olan kazanır
export function merge(localProfiles, remoteProfiles, fallbackLang) {
	const out = { ...localProfiles };
	remoteProfiles.forEach((r) => {
		const n = normalize(r, fallbackLang);
		if (!out[n.id] || out[n.id].updatedAt < n.updatedAt) {
			out[n.id] = n;
		}
	});
	return out;
}

export function downloadJSON(filename, obj) {
	const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fotoğrafı tarayıcıda küçültür: en fazla 320px, JPEG. Sunucuya ve dosyaya küçük gider.
export function shrinkPhoto(file, max = 320) {
	return new Promise((resolve, reject) => {
		if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
			return reject(new Error('type'));
		}
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => {
			const scale = Math.min(1, max / Math.max(img.width, img.height));
			const w = Math.round(img.width * scale);
			const h = Math.round(img.height * scale);
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const g = canvas.getContext('2d');
			g.fillStyle = '#fff';
			g.fillRect(0, 0, w, h);
			g.drawImage(img, 0, 0, w, h);
			URL.revokeObjectURL(url);
			resolve(canvas.toDataURL('image/jpeg', 0.86));
		};
		img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
		img.src = url;
	});
}
