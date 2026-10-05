'use strict';

const db = nodebb.require('./src/database');

// Hesapta saklama: kullanıcı başına bir meta nesnesi ve profil başına bir alan.
// Veri yalnızca kullanıcı açık onay verince buraya yazılır; onay kaydı meta nesnesinde tutulur.
const metaKey = uid => `cv-yu:uid:${uid}`;
const profilesKey = uid => `cv-yu:uid:${uid}:profiles`;

const LIMITS = {
	profiles: 5,
	profileBytes: 400 * 1024,
	id: /^[A-Za-z0-9_-]{1,40}$/,
	name: 80,
	string: 6000,
	arrayItems: 100,
	objectKeys: 60,
	depth: 7,
	photoBytes: 220 * 1024,
};

const store = module.exports;

const isPhoto = path => /\.photo$/.test(path);

function fail(key, ...args) {
	const params = args.map(a => String(a).replace(/[,[\]]/g, ' ')).join(', ');
	throw new Error(`[[cv-yu:error.${key}${params ? `, ${params}` : ''}]]`);
}

// Veri tipine göre genel sınır: yazı uzunluğu, dizi boyu, nesne derinliği. Bilinmeyen tipler atılır.
function clean(value, depth, path) {
	if (depth > LIMITS.depth) {
		fail('too-deep', path);
	}
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value === 'string') {
		if (value.length > LIMITS.string && !isPhoto(path)) {
			fail('too-long', path, LIMITS.string);
		}
		return value;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value === 'boolean') {
		return value;
	}
	if (Array.isArray(value)) {
		if (value.length > LIMITS.arrayItems) {
			fail('too-many', path, LIMITS.arrayItems);
		}
		return value.map((v, i) => clean(v, depth + 1, `${path}[${i}]`));
	}
	if (typeof value === 'object') {
		const keys = Object.keys(value);
		if (keys.length > LIMITS.objectKeys) {
			fail('too-many', path, LIMITS.objectKeys);
		}
		const out = {};
		keys.forEach((k) => {
			if (!/^[A-Za-z0-9_-]{1,40}$/.test(k)) {
				fail('bad-key', `${path}.${k}`);
			}
			out[k] = clean(value[k], depth + 1, `${path}.${k}`);
		});
		return out;
	}
	return null;
}


// Fotoğraf yalnızca küçültülmüş bir resim data URL'si olabilir
function validPhoto(photo) {
	if (!photo) {
		return '';
	}
	if (typeof photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) {
		fail('bad-photo');
	}
	if (photo.length > LIMITS.photoBytes) {
		fail('photo-too-big', Math.round(LIMITS.photoBytes / 1024));
	}
	return photo;
}

// Yüklenen profili denetler; yalnızca bilinen üst alanlar kalır
store.validate = function (id, input) {
	if (!LIMITS.id.test(String(id || ''))) {
		fail('bad-id');
	}
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		fail('not-object');
	}
	if (input.id !== undefined && input.id !== id) {
		fail('id-mismatch');
	}
	const name = typeof input.name === 'string' ? input.name.trim() : '';
	if (!name || name.length > LIMITS.name) {
		fail('bad-name', LIMITS.name);
	}
	const data = clean(input.data || {}, 0, 'data');
	if (data && data.personal && typeof data.personal === 'object') {
		data.personal.photo = validPhoto(data.personal.photo);
	}
	const settings = clean(input.settings || {}, 0, 'settings');
	const profile = {
		id,
		name,
		updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now(),
		data,
		settings,
	};
	const json = JSON.stringify(profile);
	if (json.length > LIMITS.profileBytes) {
		fail('profile-too-big', Math.round(LIMITS.profileBytes / 1024));
	}
	return { profile, json };
};

store.list = async function (uid) {
	const [meta, hash] = await Promise.all([db.getObject(metaKey(uid)), db.getObject(profilesKey(uid))]);
	const profiles = Object.values(hash || {}).map((json) => {
		try {
			return JSON.parse(json);
		} catch (err) {
			return null;
		}
	}).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
	return {
		consentAt: meta && meta.consentAt ? parseInt(meta.consentAt, 10) : 0,
		profiles,
	};
};

store.save = async function (uid, id, input, consent) {
	if (consent !== true) {
		fail('consent-required');
	}
	const { profile, json } = store.validate(id, input);
	const existing = await db.getObject(profilesKey(uid));
	const count = Object.keys(existing || {}).length;
	if (!(existing && existing[id]) && count >= LIMITS.profiles) {
		fail('too-many-profiles', LIMITS.profiles);
	}
	const meta = await db.getObject(metaKey(uid));
	await Promise.all([
		db.setObjectField(profilesKey(uid), id, json),
		db.setObject(metaKey(uid), {
			consentAt: meta && meta.consentAt ? meta.consentAt : Date.now(),
			updatedAt: Date.now(),
		}),
	]);
	return { id, updatedAt: profile.updatedAt };
};

store.remove = async function (uid, id) {
	if (!LIMITS.id.test(String(id || ''))) {
		fail('bad-id');
	}
	await db.deleteObjectField(profilesKey(uid), id);
};

// Her şeyi siler: profiller ve onay kaydı. Hesap silinince de çağrılır.
store.purge = async function (uid) {
	await db.deleteAll([metaKey(uid), profilesKey(uid)]);
};

store.LIMITS = LIMITS;
