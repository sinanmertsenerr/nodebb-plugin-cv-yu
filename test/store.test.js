'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// NodeBB olmadan çalışsın diye veritabanı bellekte taklit edilir
const hashes = new Map();
const reads = [];
global.nodebb = {
	require(name) {
		if (name !== './src/database') throw new Error(`unexpected require ${name}`);
		return {
			getObject: async (key) => { reads.push(key); return hashes.has(key) ? { ...hashes.get(key) } : null; },
			getObjectKeys: async key => Object.keys(hashes.get(key) || {}),
			getObjectField: async (key, field) => ((hashes.get(key) || {})[field] ?? null),
			setObject: async (key, obj) => { hashes.set(key, { ...(hashes.get(key) || {}), ...obj }); },
			setObjectField: async (key, field, value) => { hashes.set(key, { ...(hashes.get(key) || {}), [field]: value }); },
			deleteObjectField: async (key, field) => { const h = hashes.get(key); if (h) delete h[field]; },
			deleteAll: async keys => keys.forEach(k => hashes.delete(k)),
		};
	},
};
const store = require('../lib/store');

const profile = () => ({ id: 'abc', name: 'Deneme', updatedAt: 5, data: { personal: { name: 'Ada', photo: '' }, experience: [{ id: 'x', role: 'Dev', bullets: ['a'] }] }, settings: { template: 'sade' } });

beforeEach(() => { hashes.clear(); reads.length = 0; });
const photo = n => `data:image/jpeg;base64,${String(n).repeat(1000)}`;

test('onay olmadan kaydetmez; onayla kaydeder, listeler, siler', async () => {
	await assert.rejects(() => store.save(7, 'abc', profile(), false), /consent-required/);
	await store.save(7, 'abc', profile(), true);
	const list = await store.list(7);
	assert.equal(list.profiles.length, 1);
	assert.ok(list.consentAt > 0);
	assert.deepEqual(list.profiles[0].data.experience[0].bullets, ['a']);
	await store.remove(7, 'abc');
	assert.equal((await store.list(7)).profiles.length, 0);
	await store.save(7, 'abc', profile(), true);
	await store.purge(7);
	assert.deepEqual(await store.list(7), { consentAt: 0, profiles: [] });
});

test('sınırlar: kimlik, ad, fotoğraf, boyut, profil sayısı', async () => {
	await assert.rejects(() => store.save(1, 'bad id!', profile(), true), /bad-id/);
	await assert.rejects(() => store.save(1, 'abc', { ...profile(), name: '' }, true), /bad-name/);
	await assert.rejects(() => store.save(1, 'abc', { ...profile(), data: { personal: { photo: 'http://x/y.png' } } }, true), /bad-photo/);
	await assert.rejects(() => store.save(1, 'abc', { ...profile(), data: { personal: { photo: `data:image/jpeg;base64,${'A'.repeat(300 * 1024)}` } } }, true), /photo-too-big/);
	await assert.rejects(() => store.save(1, 'abc', { ...profile(), data: { summary: 'x'.repeat(7000) } }, true), /too-long/);
	await assert.rejects(() => store.save(1, 'abc', { ...profile(), data: { 'bad key': 1 } }, true), /bad-key/);
	await assert.rejects(() => store.save(1, 'abc', { ...profile(), id: 'other' }, true), /id-mismatch/);
	for (let i = 0; i < store.LIMITS.profiles; i += 1) {
		await store.save(2, `p${i}`, { ...profile(), id: `p${i}` }, true);
	}
	await assert.rejects(() => store.save(2, 'p9', { ...profile(), id: 'p9' }, true), /too-many-profiles/);
	await store.save(2, 'p0', { ...profile(), id: 'p0', name: 'Güncel' }, true);
	assert.equal((await store.list(2)).profiles.find(p => p.id === 'p0').name, 'Güncel');
});

test('bilinmeyen üst alanlar atılır, tipler korunur; fotoğraf profilden ayrılır', () => {
	const { profile: p, photo: ph } = store.validate('abc', { ...profile(), extra: 'x', data: { personal: { name: 'A', photo: '' }, n: 3, b: true, list: [1, 'a', null] } });
	assert.equal(p.extra, undefined);
	assert.deepEqual(p.data, { personal: { name: 'A' }, n: 3, b: true, list: [1, 'a', null] });
	assert.equal(ph, '');
	assert.equal(store.validate('abc', { ...profile(), data: { personal: { name: 'A' } } }).photo, undefined);
});

test('fotoğraf ayrı saklanır: alan yoksa korunur, boşsa silinir; kayıt fotoğrafları okumaz', async () => {
	const withPhoto = { ...profile(), data: { personal: { name: 'Ada', photo: photo(1) } } };
	await store.save(3, 'abc', withPhoto, true);
	assert.equal(JSON.parse(hashes.get('cv-yu:uid:3:profiles').abc).data.personal.photo, undefined);
	assert.equal(hashes.get('cv-yu:uid:3:photos').abc, photo(1));
	reads.length = 0;
	// Yazarken: fotoğraf alanı gönderilmez → fotoğraf yerinde kalır, hiçbir nesne içeriği okunmaz
	await store.save(3, 'abc', { ...profile(), name: 'Yeni ad', data: { personal: { name: 'Ada' } } }, true);
	assert.deepEqual(reads, []);
	let list = await store.list(3);
	assert.equal(list.profiles[0].name, 'Yeni ad');
	assert.equal(list.profiles[0].data.personal.photo, photo(1));
	await store.save(3, 'abc', { ...profile(), data: { personal: { name: 'Ada', photo: '' } } }, true);
	list = await store.list(3);
	assert.equal(list.profiles[0].data.personal.photo, '');
	await store.save(3, 'abc', withPhoto, true);
	await store.remove(3, 'abc');
	assert.equal((hashes.get('cv-yu:uid:3:photos') || {}).abc, undefined);
	await store.save(3, 'abc', withPhoto, true);
	await store.purge(3);
	assert.equal(hashes.has('cv-yu:uid:3:photos'), false);
});

test('eski kayıt: profilin içindeki fotoğraf ilk okumada ayrı alana taşınır', async () => {
	const old = { ...profile(), data: { personal: { name: 'Ada', photo: photo(2) } } };
	hashes.set('cv-yu:uid:4', { consentAt: 10 });
	hashes.set('cv-yu:uid:4:profiles', { abc: JSON.stringify(old) });
	const list = await store.list(4);
	assert.equal(list.profiles[0].data.personal.photo, photo(2));
	assert.equal(JSON.parse(hashes.get('cv-yu:uid:4:profiles').abc).data.personal.photo, undefined);
	assert.equal(hashes.get('cv-yu:uid:4:photos').abc, photo(2));
	assert.equal((await store.list(4)).profiles[0].data.personal.photo, photo(2));
});

test('metin sınırı fotoğraftan bağımsız: 180 KB', async () => {
	const big = { ...profile(), data: { personal: { name: 'A' }, experience: Array.from({ length: 100 }, (_, i) => ({ id: `e${i}`, role: 'x'.repeat(2000) })) } };
	await assert.rejects(() => store.save(5, 'abc', big, true), /profile-too-big/);
	const ok = { ...profile(), data: { personal: { name: 'A', photo: photo(3) }, experience: Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, role: 'x'.repeat(2000) })) } };
	await store.save(5, 'abc', ok, true);
});
