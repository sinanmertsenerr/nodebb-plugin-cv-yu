'use strict';

const db = nodebb.require('./src/database');

// Hesapta saklama: kullanıcı başına bir meta nesnesi, profil başına bir alan ve fotoğraflar ayrı bir nesnede.
// Fotoğraf ayrı durur: yazarken yapılan her kayıt yalnızca birkaç KB'lık metni yazar, fotoğrafı ne alır ne okur.
// Veri yalnızca kullanıcı açık onay verince buraya yazılır; onay kaydı meta nesnesinde tutulur.
const metaKey = uid => `cv-yu:uid:${uid}`;
const profilesKey = uid => `cv-yu:uid:${uid}:profiles`;
const photosKey = uid => `cv-yu:uid:${uid}:photos`;

const LIMITS = {
	profiles: 5,
	profileBytes: 180 * 1024, // fotoğrafsız metin
	id: /^[A-Za-z0-9_-]{1,40}$/,
	name: 80,
	string: 6000,
	arrayItems: 100,
	objectKeys: 60,
	depth: 7,
	photoBytes: 220 * 1024,
};

const store = module.exports;

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
		if (value.length > LIMITS.string) {
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

// Yüklenen profili denetler; yalnızca bilinen üst alanlar kalır.
// photo: undefined = profilde fotoğraf alanı yok (değişmedi), '' = kaldır, data URL = yeni fotoğraf.
// Eski istemciler fotoğrafı her seferinde gönderir; o da kabul edilir ve ayrı alana yazılır.
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
	const inData = input.data && typeof input.data === 'object' ? input.data : {};
	const inPersonal = inData.personal && typeof inData.personal === 'object' && !Array.isArray(inData.personal) ? inData.personal : null;
	let photo;
	let dataIn = inData;
	if (inPersonal && Object.prototype.hasOwnProperty.call(inPersonal, 'photo')) {
		photo = validPhoto(inPersonal.photo);
		const personal = { ...inPersonal };
		delete personal.photo;
		dataIn = { ...inData, personal };
	}
	const data = clean(dataIn, 0, 'data');
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
	return { profile, json, photo };
};

function parse(json) {
	try {
		return JSON.parse(json);
	} catch (err) {
		return null;
	}
}

store.list = async function (uid) {
	const [consentAt, hash, photos] = await Promise.all([
		db.getObjectField(metaKey(uid), 'consentAt'),
		db.getObject(profilesKey(uid)),
		db.getObject(photosKey(uid)),
	]);
	const moves = [];
	const profiles = Object.entries(hash || {}).map(([id, json]) => {
		const p = parse(json);
		const personal = p && p.data && p.data.personal && typeof p.data.personal === 'object' ? p.data.personal : null;
		if (!personal) {
			return p;
		}
		let photo = (photos && photos[id]) || '';
		// Eski kayıt: fotoğraf profilin içindeyse bir kez ayrı alana taşınır
		if (Object.prototype.hasOwnProperty.call(personal, 'photo')) {
			if (personal.photo && !photo) {
				photo = personal.photo;
				moves.push(db.setObjectField(photosKey(uid), id, photo));
			}
			delete personal.photo;
			moves.push(db.setObjectField(profilesKey(uid), id, JSON.stringify(p)));
		}
		personal.photo = photo;
		return p;
	}).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
	await Promise.all(moves);
	return {
		consentAt: consentAt ? parseInt(consentAt, 10) : 0,
		profiles,
	};
};

store.save = async function (uid, id, input, consent) {
	if (consent !== true) {
		fail('consent-required');
	}
	const { profile, json, photo } = store.validate(id, input);
	// Yalnızca alan adları okunur (profillerin içeriği değil)
	const [ids, consentAt] = await Promise.all([db.getObjectKeys(profilesKey(uid)), db.getObjectField(metaKey(uid), 'consentAt')]);
	if (!ids.includes(id) && ids.length >= LIMITS.profiles) {
		fail('too-many-profiles', LIMITS.profiles);
	}
	const writes = [
		db.setObjectField(profilesKey(uid), id, json),
		db.setObject(metaKey(uid), { consentAt: consentAt || Date.now(), updatedAt: Date.now() }),
	];
	if (photo !== undefined) {
		writes.push(photo ? db.setObjectField(photosKey(uid), id, photo) : db.deleteObjectField(photosKey(uid), id));
	}
	await Promise.all(writes);
	return { id, updatedAt: profile.updatedAt };
};

store.remove = async function (uid, id) {
	if (!LIMITS.id.test(String(id || ''))) {
		fail('bad-id');
	}
	await Promise.all([db.deleteObjectField(profilesKey(uid), id), db.deleteObjectField(photosKey(uid), id)]);
};

// Her şeyi siler: profiller ve onay kaydı. Hesap silinince de çağrılır.
store.purge = async function (uid) {
	await db.deleteAll([metaKey(uid), profilesKey(uid), photosKey(uid)]);
};

store.LIMITS = LIMITS;
