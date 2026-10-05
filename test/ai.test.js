'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/ai.js');

test('komut: kurallar, biçim ve kişinin metni var; iyileştirmede fotoğraf yok', async () => {
	const A = await load();
	const { sampleProfile } = await import('../src/sample.js');
	const p = sampleProfile('X', 'tr');
	p.data.personal.photo = 'data:image/jpeg;base64,AAAA';
	const fresh = A.buildPrompt({ mode: 'new', lang: 'tr', text: 'Adım Ayşe, ODTÜ mezunuyum.' });
	assert.match(fresh, /UYDURMA/);
	assert.match(fresh, /"experience"/);
	assert.match(fresh, /Adım Ayşe/);
	const improve = A.buildPrompt({ mode: 'improve', lang: 'en', profile: p });
	assert.match(improve, /Improve the CV/);
	assert.match(improve, /Elif Kaya/);
	assert.doesNotMatch(improve, /base64/);
	assert.doesNotMatch(improve, /"id"/);
});

test('cevap: kod bloğu, önde yazı, eksik alanlar ve seviye adları toparlanır', async () => {
	const A = await load();
	const answer = 'Tabii! İşte CV:\n```json\n{"personal":{"name":"Ayşe Demir","title":"Veri Analisti"},"summary":"Kısa özet.","experience":[{"role":"Stajyer","company":"ABC","start":"2024-06","current":true,"end":"2024-09","bullets":["- Rapor hazırladım","  "]}],"skills":[{"group":"Araçlar","items":["Excel","SQL"]}],"languages":[{"name":"İngilizce","level":"İleri (C1)"}],"awards":[]}\n```\nBaşarılar!';
	const p = A.profileFromAI(answer, { lang: 'tr' });
	assert.equal(p.name, 'Ayşe Demir');
	assert.equal(p.data.experience[0].end, '');
	assert.deepEqual(p.data.experience[0].bullets, ['Rapor hazırladım']);
	assert.equal(p.data.skills[0].items, 'Excel, SQL');
	assert.equal(p.data.languages[0].level, 'advanced');
	assert.ok(p.data.experience[0].id);
	const vis = Object.fromEntries(p.data.sections.map(s => [s.type, s.visible]));
	assert.equal(vis.experience, true);
	assert.equal(vis.awards, false);
	assert.equal(vis.projects, false);
});

test('cevap: iyileştirmede fotoğraf, ayarlar ve sıra korunur; bozuk cevap hata verir', async () => {
	const A = await load();
	const { sampleProfile } = await import('../src/sample.js');
	const base = sampleProfile('Benim CV', 'tr');
	base.data.personal.photo = 'data:image/jpeg;base64,AAAA';
	base.settings.template = 'harvard';
	const p = A.profileFromAI(JSON.stringify({ personal: { name: 'Elif Kaya' }, summary: 'Yeni özet' }), { lang: 'tr', name: 'Benim CV – YZ', base });
	assert.equal(p.data.personal.photo, 'data:image/jpeg;base64,AAAA');
	assert.equal(p.settings.template, 'harvard');
	assert.equal(p.name, 'Benim CV – YZ');
	assert.equal(p.data.summary, 'Yeni özet');
	assert.deepEqual(p.data.sections.map(s => s.type), base.data.sections.map(s => s.type));
	assert.throws(() => A.profileFromAI('Üzgünüm, yardımcı olamam.', { lang: 'tr' }));
	assert.throws(() => A.profileFromAI('{"foo": 1}', { lang: 'tr' }));
	assert.equal(A.extractJSON('{“personal”: {“name”: “A”},}').personal.name, 'A');
});

test('JSON yükle: kendi dosyamız (BOM ile), NextCV dosyası ve yapay zekâ cevabı okunur', async () => {
	const A = await load();
	const M = await import('../src/model.js');
	const { sampleProfile } = await import('../src/sample.js');
	const p = sampleProfile('Gidip gelen', 'tr');
	p.data.personal.photo = 'data:image/jpeg;base64,AAAA';
	const file = `﻿${JSON.stringify({ format: M.EXPORT_FORMAT, exportedAt: 'x', profiles: [p] })}`;
	const back = A.readImport(file, 'en')[0];
	assert.deepEqual(back, M.normalize(p, 'en'));
	const next = A.readImport(JSON.stringify({ personalInfo: { fullName: 'Can Er', email: 'c@e.co' } }), 'tr')[0];
	assert.equal(next.data.personal.email, 'c@e.co');
	const ai = A.readImport('```json\n{"personal":{"name":"Deniz"},"experience":[{"role":"Stajyer","company":"X"}]}\n```', 'tr')[0];
	assert.equal(ai.data.personal.name, 'Deniz');
	assert.equal(ai.data.experience[0].company, 'X');
	assert.throws(() => A.readImport('merhaba', 'tr'));
	// Yapay zekâ kutusuna dışa aktarma dosyası yapıştırılırsa da çalışır
	assert.equal(A.profileFromAI(file, { lang: 'tr' }).name, 'Gidip gelen');
});

test('PDF metni: harf parçaları birleşir, kelime arası boşluk ve satırlar korunur', async () => {
	const { joinItems } = await import('../src/filetext.js');
	const at = (str, x, y, width, eol) => ({ str, transform: [10, 0, 0, 10, x, y], width, hasEOL: !!eol });
	const text = joinItems([
		at('Mühendisli', 0, 100, 50), at('ğ', 50, 100, 5), at('i', 55, 100, 3), at('Öğrencisi', 61, 100, 40, true),
		at('İzmir', 0, 80, 25), at('Türkiye', 40, 80, 35),
	]);
	assert.equal(text, 'Mühendisliği Öğrencisi\nİzmir Türkiye');
});
