'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ESM kaynaklar dynamic import ile
async function load() {
	const [model, paginate, i18n] = await Promise.all([import('../src/model.js'), import('../src/paginate.js'), import('../src/i18n.js')]);
	return { ...model, ...paginate, ...i18n };
}

test('yeni profil tam ve normalize değişmeden geçer', async () => {
	const M = await load();
	const p = M.newProfile('Deneme', 'tr');
	assert.equal(p.settings.lang, 'tr');
	assert.equal(p.data.sections.length, M.SECTION_TYPES.length);
	assert.deepEqual(M.normalize(p, 'tr'), p);
	assert.equal(M.normalize({ settings: { template: 'bilinmeyen', lang: 'xx' }, data: { sections: [{ type: 'skills' }, { type: 'skills' }] } }, 'en').settings.template, 'sade');
	const n = M.normalize({ data: { sections: [{ type: 'skills', visible: false }] } }, 'en');
	assert.equal(n.data.sections[0].type, 'skills');
	assert.equal(n.data.sections.length, M.SECTION_TYPES.length);
});

test('dış biçim (personalInfo) içe aktarılır', async () => {
	const M = await load();
	const foreign = { state: { personalInfo: { fullName: 'Ada L', jobTitle: 'Dev', email: 'a@b.c', profilePhoto: 'http://x/y.png' }, summary: 'Hi', experience: [{ title: 'Eng', company: 'ACME', startDate: '2023-03', endDate: 'Present', bullets: ['Did x'] }], languages: [{ language: 'English', proficiency: 'Akıcı' }], sections: [{ type: 'experience', visible: true }, { type: 'summary', visible: false }] } };
	const [p] = M.parseImport(JSON.stringify(foreign), 'tr');
	assert.equal(p.data.personal.name, 'Ada L');
	assert.equal(p.data.personal.photo, '');
	assert.equal(p.data.experience[0].current, true);
	assert.equal(p.data.languages[0].level, 'fluent');
	assert.equal(p.data.sections[0].type, 'experience');
	assert.equal(p.data.sections[1].visible, false);
	assert.throws(() => M.parseImport('{"foo":1}', 'tr'), /unknown-format/);
	const own = M.parseImport(JSON.stringify({ format: M.EXPORT_FORMAT, profiles: [M.newProfile('X', 'en')] }), 'tr');
	assert.equal(own[0].name, 'X');
});

test('sayfalama: başlık yetim kalmaz, uzun blok taşar ama tek başına durur', async () => {
	const M = await load();
	const blocks = [
		{ key: 'h', height: 100 },
		{ key: 't1', height: 20, keepWithNext: true }, { key: 'a', height: 400 }, { key: 'b', height: 400 },
		{ key: 't2', height: 20, keepWithNext: true }, { key: 'c', height: 300 },
		{ key: 'big', height: 2000 }, { key: 'd', height: 50 },
	];
	const pages = M.distribute(blocks, 1000);
	assert.deepEqual(pages, [['h', 't1', 'a', 'b'], ['t2', 'c'], ['big'], ['d']]);
	assert.deepEqual(M.distribute([], 1000), [[]]);
	const cols = M.layoutColumns([{ key: 'side', blocks: [{ key: 's1', height: 1500 }] }, { key: 'main', blocks: [{ key: 'm1', height: 10 }] }], 1000);
	assert.equal(cols.length, 1);
	assert.deepEqual(cols[0][0].keys, ['s1']);
});

test('tarihler CV diline göre', async () => {
	const M = await load();
	assert.equal(M.formatDate('2024-09', 'tr'), 'Eyl 2024');
	assert.equal(M.formatDate('09/2024', 'en'), 'Sep 2024');
	assert.equal(M.formatDate('2024', 'tr'), '2024');
	assert.equal(M.formatDate('Yaz 2023', 'tr'), 'Yaz 2023');
	assert.equal(M.formatRange('2023-03', '', true, 'tr'), 'Mar 2023 – Devam ediyor');
	assert.equal(M.formatRange('', '2022', false, 'en'), '2022');
	assert.equal(M.makeT('tr')('toolbar.pages', 2), '2 sayfa');
	assert.equal(M.makeT('xx')('close'), 'Close');
});
