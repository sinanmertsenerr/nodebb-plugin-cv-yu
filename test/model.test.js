'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ESM kaynaklar dynamic import ile
async function load() {
	const [model, paginate, i18n, importer] = await Promise.all([import('../src/model.js'), import('../src/paginate.js'), import('../src/i18n.js'), import('../src/import.js')]);
	return { ...model, ...paginate, ...i18n, ...importer };
}

test('yeni profil tam ve normalize değişmeden geçer', async () => {
	const M = await load();
	const p = M.newProfile('Deneme', 'tr');
	assert.equal(p.settings.lang, 'tr');
	assert.equal(p.data.sections.length, M.SECTION_TYPES.length);
	assert.deepEqual(M.normalize(p, 'tr'), p);
	assert.equal(M.normalize({ settings: { template: 'bilinmeyen', lang: 'xx' }, data: { sections: [{ type: 'skills' }, { type: 'skills' }] } }, 'en').settings.template, 'sade');
	const old = M.normalize({ settings: { template: 'eski', theme: { primary: '#0b5', size: 'l' } } }, 'tr');
	assert.equal(old.settings.template, 'sade');
	assert.equal(M.normalize({ settings: { template: 'yan' } }, 'tr').settings.template, 'yan');
	assert.equal(M.newProfile('X', 'tr').settings.template, 'sade');
	assert.equal(old.settings.theme.primary, '#0b5');
	assert.equal(old.settings.theme.size, 'l');
	assert.equal(M.normalize({ settings: { template: 'harvard' } }, 'tr').settings.theme.font, 'serif');
	const toH = M.switchTemplate({ template: 'sade', theme: { ...M.DEFAULT_THEME, size: 's' } }, 'harvard');
	assert.equal(toH.theme.font, 'serif');
	assert.equal(toH.theme.size, 's');
	const back = M.switchTemplate(toH, 'sikisik');
	assert.equal(back.theme.primary, M.DEFAULT_THEME.primary);
	assert.equal(M.switchTemplate({ template: 'sade', theme: { primary: '#123' } }, 'sikisik').theme.primary, '#123');
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

test('doğum tarihi: tam tarih gün.ay.yıl, yalnızca yıl olduğu gibi', async () => {
	const M = await load();
	assert.equal(M.formatBirthDate('2003-05-04', 'tr'), '04.05.2003');
	assert.equal(M.formatBirthDate('2003-05-04', 'en'), '04/05/2003');
	assert.equal(M.formatBirthDate('2003', 'tr'), '2003');
	assert.equal(M.formatBirthDate('14.05.2003', 'tr'), '14.05.2003');
	assert.equal(M.formatBirthDate('', 'tr'), '');
	assert.equal(M.doc('tr').labels.birthDate, 'Doğum Tarihi');
});

test('sürükle-bırak sıralaması öğeyi doğru yere taşır', async () => {
	const { moveItem } = await import('../src/ui/sortable.js');
	assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
	assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c']);
	assert.deepEqual(moveItem(['a', 'b'], 1, 1), ['a', 'b']);
});

test('örnek CV: tam dolu, doğru dilde, kimlikler benzersiz', async () => {
	const { sampleProfile } = await import('../src/sample.js');
	const M = await load();
	const tr = sampleProfile('Adsız CV', 'tr');
	assert.equal(tr.name, 'Adsız CV');
	assert.equal(tr.settings.template, 'sade');
	assert.equal(tr.data.personal.name, 'Elif Kaya');
	assert.ok(tr.data.experience.length >= 2 && tr.data.experience.every(e => e.id));
	assert.deepEqual(M.normalize(tr, 'tr'), tr);
	const en = sampleProfile('Untitled CV', 'en');
	assert.equal(en.settings.lang, 'en');
	assert.match(en.data.summary, /Software Engineering/);
	const ids = [...tr.data.experience, ...tr.data.projects].map(x => x.id);
	assert.equal(new Set(ids).size, ids.length);
	assert.notEqual(tr.data.experience[0].id, sampleProfile('X', 'tr').data.experience[0].id);
});

test('ince ayar: hazır seçeneğin yerine geçer, sınır dışı değer kırpılır, bozuk değer atılır', async () => {
	const M = await load();
	const base = M.newProfile('X', 'tr');
	assert.deepEqual(M.themeMetrics(base.settings.theme), { sizePx: 10.5, lineHeight: 1.5, gapPx: 12, marginPx: 50 });
	assert.deepEqual(M.themeMetrics({ size: 's', spacing: 'l', margins: 's', sizePx: 11.5, gapPx: 9 }), { sizePx: 11.5, lineHeight: 1.7, gapPx: 9, marginPx: 30 });
	const n = M.normalize({ settings: { theme: { sizePx: 4, lineHeight: 1.3, gapPx: 'on', marginPx: null } } }, 'tr');
	assert.equal(n.settings.theme.sizePx, M.FINE.sizePx.min);
	assert.equal(n.settings.theme.lineHeight, 1.3);
	assert.equal('gapPx' in n.settings.theme, false);
	assert.equal('marginPx' in n.settings.theme, false);
	Object.keys(M.FINE).forEach(key => assert.ok(M.FINE[key].fit >= M.FINE[key].min && M.FINE[key].fit <= M.FINE[key].soft && M.FINE[key].soft <= M.FINE[key].max, key));
});
