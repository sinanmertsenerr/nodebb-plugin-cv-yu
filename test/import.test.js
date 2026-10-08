'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = async () => ({ ...(await import('../src/import.js')), ...(await import('../src/model.js')), ...(await import('../src/ai.js')) });
const visibleOf = p => Object.fromEntries(p.data.sections.map(s => [s.type, s.visible]));

// NextCV'nin "JSON dışa aktar" dosyası: { version, exportDate, cvData, coverLetterData, appSettings }
const nextcv = () => ({
	version: '1.0',
	exportDate: '2026-10-08T10:00:00.000Z',
	cvData: {
		personalInfo: { fullName: 'Ada Yılmaz', jobTitle: 'Yazılım Mühendisi', location: 'İzmir, Türkiye', email: 'ada@ornek.com', phone: '+90 555 000 00 00', linkedin: 'in/adayilmaz', github: 'github.com/ada', website: '', nationality: 'T.C.', drivingLicense: 'B', birthDate: '2003-05-04', profilePhoto: 'data:image/jpeg;base64,AAAA' },
		summary: 'Kısa özet.',
		experience: [{ id: 'e1', title: 'Stajyer', company: 'ACME', location: 'İzmir', startDate: 'Mar 2023', endDate: 'Present', bullets: ['Rapor hazırladım'] }, { id: 'e2', title: 'Asistan', company: 'Beta', location: '', startDate: 'Haziran 2021', endDate: 'Şub 2023', bullets: [] }],
		projects: [{ id: 'p1', name: 'Pano', link: 'github.com/ada/pano', date: 'Jan 2024 - Present', bullets: ['Açık kaynak'] }, { id: 'p2', name: 'Bütçe', link: '', date: 'Aug 2023 - Dec 2023', bullets: [''] }],
		education: [{ id: 'd1', degree: 'Bilgisayar Mühendisliği', institution: 'Yaşar Üniversitesi', startDate: '2021', year: '2025', gpa: '3.4/4.0' }],
		involvement: [{ id: 'i1', role: 'Başkan', organization: 'Yazılım Kulübü', institution: 'Yaşar Üniversitesi', startDate: 'Oct 2022', endDate: 'Jul 2024', bullets: ['Etkinlik düzenledim'] }],
		skills: [{ id: 's1', category: 'Frontend', items: 'React, TypeScript' }],
		certifications: [{ id: 'c1', name: 'AWS CCP', issuer: 'Amazon', year: '2023', description: '' }],
		languages: [{ id: 'l1', language: 'Türkçe', proficiency: 'native' }, { id: 'l2', language: 'İngilizce', proficiency: 'fluent' }, { id: 'l3', language: 'Almanca', proficiency: 'beginner' }],
		awards: [{ id: 'a1', title: 'Birincilik', issuer: 'TÜBİTAK', year: '2024', description: 'Proje yarışması' }],
		hobbies: 'Fotoğraf, yüzme',
		references: [{ id: 'r1', name: 'Can Er', title: 'Müdür', company: 'ACME', email: 'can@acme.com', phone: '1' }],
		sections: [
			{ id: 'x0', type: 'personalInfo', title: 'Personal Info', visible: true }, { id: 'x1', type: 'education', title: 'Education', visible: true },
			{ id: 'x2', type: 'experience', title: 'Experience', visible: true }, { id: 'x3', type: 'summary', title: 'Summary', visible: false },
		],
	},
	coverLetterData: { recipientName: 'Sarah Johnson', company: 'Acme', body: 'Dear…' },
	appSettings: { template: 'compact', theme: { primaryColor: '#1a1a2e', accentColor: '#4a6cf7', fontFamily: 'Inter', fontSize: 'small', lineSpacing: 'relaxed', pageMargins: 'narrow', sectionTitleStyle: 'capitalize', sectionSpacing: 'normal', photoSize: 'lg', photoShape: 'rounded', photoVisible: true, showIcons: false } },
});

test('NextCV dışa aktarma dosyası (cvData sarmalayıcısı) eksiksiz okunur', async () => {
	const I = await load();
	const list = I.readImport(JSON.stringify(nextcv(), null, 2), 'tr');
	assert.equal(list.length, 1);
	const p = list[0];
	assert.equal(p.name, 'Ada Yılmaz');
	assert.deepEqual({ ...p.data.personal }, { name: 'Ada Yılmaz', title: 'Yazılım Mühendisi', location: 'İzmir, Türkiye', email: 'ada@ornek.com', phone: '+90 555 000 00 00', linkedin: 'in/adayilmaz', github: 'github.com/ada', website: '', nationality: 'T.C.', license: 'B', birthDate: '2003-05-04', photo: 'data:image/jpeg;base64,AAAA' });
	assert.equal(p.data.summary, 'Kısa özet.');
	const [e1, e2] = p.data.experience;
	assert.deepEqual([e1.role, e1.company, e1.location, e1.start, e1.end, e1.current, e1.bullets], ['Stajyer', 'ACME', 'İzmir', '2023-03', '', true, ['Rapor hazırladım']]);
	assert.deepEqual([e2.start, e2.end, e2.current, e2.bullets], ['2021-06', '2023-02', false, ['']]);
	assert.deepEqual([p.data.projects[0].start, p.data.projects[0].end], ['2024-01', 'Devam ediyor']);
	assert.deepEqual([p.data.projects[1].start, p.data.projects[1].end], ['2023-08', '2023-12']);
	const edu = p.data.education[0];
	assert.deepEqual([edu.degree, edu.school, edu.start, edu.end, edu.gpa], ['Bilgisayar Mühendisliği', 'Yaşar Üniversitesi', '2021', '2025', '3.4/4.0']);
	assert.deepEqual([p.data.involvement[0].role, p.data.involvement[0].org, p.data.involvement[0].start, p.data.involvement[0].end], ['Başkan', 'Yazılım Kulübü · Yaşar Üniversitesi', '2022-10', '2024-07']);
	assert.deepEqual([p.data.skills[0].group, p.data.skills[0].items], ['Frontend', 'React, TypeScript']);
	assert.deepEqual([p.data.certifications[0].name, p.data.certifications[0].issuer, p.data.certifications[0].date], ['AWS CCP', 'Amazon', '2023']);
	assert.deepEqual(p.data.languages.map(l => l.level), ['native', 'fluent', 'basic']);
	assert.deepEqual([p.data.awards[0].name, p.data.awards[0].issuer, p.data.awards[0].date, p.data.awards[0].note], ['Birincilik', 'TÜBİTAK', '2024', 'Proje yarışması']);
	assert.equal(p.data.hobbies, 'Fotoğraf, yüzme');
	assert.deepEqual([p.data.references[0].name, p.data.references[0].title, p.data.references[0].email], ['Can Er', 'Müdür', 'can@acme.com']);
	// Bölüm sırası ve gizlilik dosyadan; listede olmayan dolu bölümler arkaya eklenir
	assert.deepEqual(p.data.sections.slice(0, 3).map(s => s.type), ['education', 'experience', 'summary']);
	assert.equal(p.data.sections.length, I.SECTION_TYPES.length);
	assert.equal(visibleOf(p).summary, false);
	assert.equal(visibleOf(p).awards, true);
	// Görünüm: şablon ve ölçüler taşınır, dokunulmamış NextCV renkleri taşınmaz
	assert.equal(p.settings.template, 'sikisik');
	const th = p.settings.theme;
	assert.deepEqual([th.size, th.spacing, th.margins, th.titleStyle, th.icons, th.photoShape, th.photoSize], ['s', 'l', 's', 'capitalize', false, 'rounded', 'l']);
	// İnce ayarlar ve fotoğraf görünürlüğü de gelir; bölüm aralığı ayrı hazır seçenek
	const tuned = nextcv();
	Object.assign(tuned.appSettings.theme, { fontScaleOverride: 0.9, lineHeightOverride: 1.2, pageMarginsOverride: 24, sectionSpacingOverride: 4, sectionSpacing: 'tight', photoVisible: false });
	const tt = I.readImport(JSON.stringify(tuned), 'tr')[0].settings.theme;
	assert.deepEqual([tt.sizePx, tt.lineHeight, tt.marginPx, tt.gapPx, tt.gap, tt.photo], [10.75, 1.2, 24, 4, 's', false]);
	assert.deepEqual([th.primary, th.accent], [I.DEFAULT_THEME.primary, I.DEFAULT_THEME.accent]);
	const tinted = nextcv();
	tinted.appSettings.theme.accentColor = '#FF0000';
	assert.equal(I.importAny(tinted, 'tr')[0].settings.theme.accent, '#ff0000');
	// Sonuç normalize'dan değişmeden geçer ve yapay zekâ kutusuna yapıştırılınca da okunur
	assert.deepEqual(I.normalize(p, 'tr'), p);
	assert.equal(I.profileFromAI(JSON.stringify(nextcv()), { lang: 'tr' }).data.experience.length, 2);
});

test('NextCV tarayıcı kaydı: birden çok profil kendi adıyla gelir', async () => {
	const I = await load();
	const a = nextcv();
	const b = nextcv();
	b.cvData.personalInfo.fullName = 'Ada Yılmaz';
	const stored = { state: { activeProfileId: 'p1', profiles: [{ id: 'p1', name: 'Türkçe CV', cvData: a.cvData, appSettings: a.appSettings }, { id: 'p2', name: 'English CV', cvData: b.cvData, appSettings: { template: 'modern', theme: {} } }] }, version: 0 };
	const list = I.importAny(stored, 'tr');
	assert.deepEqual(list.map(p => p.name), ['Türkçe CV', 'English CV']);
	assert.deepEqual(list.map(p => p.settings.template), ['sikisik', 'yan']);
	assert.equal(list[1].data.personal.name, 'Ada Yılmaz');
});

test('JSON Resume (basics, work, volunteer, certificates, publications) okunur', async () => {
	const I = await load();
	const resume = {
		$schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
		basics: {
			name: 'Deniz Kara', label: 'Veri Analisti', image: 'https://ornek.com/foto.jpg', email: 'deniz@ornek.com', phone: '(912) 555-4321', url: 'https://deniz.dev', summary: 'Analist.',
			location: { address: 'Gizli Sokak 1', postalCode: '35000', city: 'İzmir', countryCode: 'TR', region: 'Ege' },
			profiles: [{ network: 'LinkedIn', username: 'denizkara', url: 'https://linkedin.com/in/denizkara' }, { network: 'GitHub', username: 'dkara' }],
		},
		work: [{ name: 'Veri A.Ş.', position: 'Analist', url: 'https://veri.as', startDate: '2022-01-15', endDate: '', summary: 'Raporlama ekibi.', highlights: ['Pano kurdum', 'Maliyeti %10 azalttım'] }],
		volunteer: [{ organization: 'TEMA', position: 'Gönüllü', startDate: '2020-06', endDate: '2021-06', summary: '', highlights: ['Fidan diktim'] }],
		education: [{ institution: 'Ege Üniversitesi', area: 'İstatistik', studyType: 'Lisans', startDate: '2016-09-01', endDate: '2020-06-30', score: '3.2', courses: ['IST101'] }],
		awards: [{ title: 'Yılın Çalışanı', date: '2023-11-01', awarder: 'Veri A.Ş.', summary: 'Ekip ödülü' }],
		certificates: [{ name: 'Google Data Analytics', date: '2021-11-07', issuer: 'Coursera', url: 'https://c.org/x' }],
		publications: [{ name: 'Veriyle Karar', publisher: 'Dergi', releaseDate: '2024-10-01', summary: 'Makale' }],
		skills: [{ name: 'Web', level: 'Master', keywords: ['HTML', 'CSS'] }, { name: 'SQL', level: 'İyi', keywords: [] }, { name: 'Python' }],
		languages: [{ language: 'İngilizce', fluency: 'Professional working proficiency' }, { language: 'Türkçe', fluency: 'Native speaker' }],
		interests: [{ name: 'Müzik', keywords: ['gitar', 'piyano'] }, { name: 'Koşu' }],
		references: [{ name: 'Jane Doe', reference: 'Harika biri.' }],
		projects: [{ name: 'Açık Veri', description: 'Belediye verisi panosu.', highlights: ['1000 kullanıcı'], keywords: ['D3', 'Node'], startDate: '2023-01', endDate: '2023-06', url: 'https://acik.veri' }],
		meta: { canonical: 'x', version: 'v1.0.0', lastModified: '2026-01-01T00:00:00' },
	};
	const [p] = I.importAny(resume, 'tr');
	const per = p.data.personal;
	assert.deepEqual([per.name, per.title, per.email, per.website, per.location, per.linkedin, per.github, per.photo], ['Deniz Kara', 'Veri Analisti', 'deniz@ornek.com', 'https://deniz.dev', 'İzmir, Ege, TR', 'https://linkedin.com/in/denizkara', 'dkara', '']);
	assert.equal(p.data.summary, 'Analist.');
	const w = p.data.experience[0];
	assert.deepEqual([w.company, w.role, w.start, w.end, w.current, w.bullets], ['Veri A.Ş.', 'Analist', '2022-01', '', false, ['Raporlama ekibi.', 'Pano kurdum', 'Maliyeti %10 azalttım']]);
	assert.deepEqual([p.data.involvement[0].org, p.data.involvement[0].role, p.data.involvement[0].start], ['TEMA', 'Gönüllü', '2020-06']);
	const edu = p.data.education[0];
	assert.deepEqual([edu.school, edu.degree, edu.start, edu.end, edu.gpa], ['Ege Üniversitesi', 'Lisans, İstatistik', '2016-09', '2020-06', '3.2']);
	assert.deepEqual(p.data.awards.map(a => [a.name, a.issuer, a.date, a.note]), [['Yılın Çalışanı', 'Veri A.Ş.', '2023-11', 'Ekip ödülü'], ['Veriyle Karar', 'Dergi', '2024-10', 'Makale']]);
	assert.deepEqual([p.data.certifications[0].name, p.data.certifications[0].issuer, p.data.certifications[0].date, p.data.certifications[0].link], ['Google Data Analytics', 'Coursera', '2021-11', 'https://c.org/x']);
	assert.deepEqual(p.data.skills.map(s => [s.group, s.items]), [['Web', 'HTML, CSS'], ['', 'SQL, Python']]);
	assert.deepEqual(p.data.languages.map(l => [l.name, l.level]), [['İngilizce', 'advanced'], ['Türkçe', 'native']]);
	assert.equal(p.data.hobbies, 'Müzik (gitar, piyano), Koşu');
	assert.equal(p.data.references[0].name, 'Jane Doe');
	const pr = p.data.projects[0];
	assert.deepEqual([pr.name, pr.link, pr.start, pr.end, pr.bullets], ['Açık Veri', 'https://acik.veri', '2023-01', '2023-06', ['Belediye verisi panosu.', '1000 kullanıcı', 'D3, Node']]);
	// Yalnız dolu bölümler görünür; yalnız yayın varsa bölüm "Yayınlar" adını alır
	assert.equal(Object.values(visibleOf(p)).every(Boolean), true);
	const only = I.importAny({ basics: { name: 'A B' }, publications: [{ name: 'Makale', publisher: 'Dergi' }] }, 'tr')[0];
	assert.equal(only.data.sections.find(s => s.type === 'awards').title, 'Yayınlar');
	assert.equal(visibleOf(only).experience, false);
});

test('Reactive Resume (sections.x.items, HTML metin, tek tarih alanı) okunur', async () => {
	const I = await load();
	const rx = {
		basics: { name: 'Efe Su', headline: 'Tasarımcı', email: 'efe@su.co', phone: '', location: 'Ankara', url: { label: '', href: 'https://efe.su' }, customFields: [], picture: { url: 'https://x/y.png', size: 64 } },
		sections: {
			summary: { name: 'Summary', columns: 1, visible: true, id: 'summary', content: '<p>Ürün <strong>tasarımcısı</strong>.</p><p>5 yıl &amp; 3 ürün.</p>' },
			experience: { name: 'Experience', visible: true, id: 'experience', items: [{ id: 'a', visible: true, company: 'Stüdyo', position: 'Tasarımcı', location: 'Ankara', date: 'March 2020 – Present', summary: '<ul><li><p>Arayüz çizdim</p></li><li><p>Test yaptım</p></li></ul>', url: { label: '', href: '' } }] },
			education: { name: 'Education', visible: true, items: [{ institution: 'ODTÜ', studyType: 'Lisans', area: 'Endüstri Ürünleri Tasarımı', score: '', date: '2015 - 2019', summary: '' }] },
			skills: { name: 'Skills', visible: true, items: [{ name: 'Figma', description: 'İleri', level: 4, keywords: [] }, { name: 'Araştırma', level: 3, keywords: ['Görüşme', 'Anket'] }] },
			languages: { name: 'Languages', visible: true, items: [{ name: 'İngilizce', description: '', level: 5 }, { name: 'Almanca', description: 'A2', level: 0 }] },
			profiles: { name: 'Profiles', visible: true, items: [{ network: 'GitHub', username: 'efesu', url: { label: '', href: 'https://github.com/efesu' } }] },
			references: { name: 'References', visible: false, items: [{ name: 'Ali Veli', description: 'Yönetici' }] },
			interests: { items: [] }, awards: { items: [] }, certifications: { items: [] }, projects: { items: [] }, publications: { items: [] }, volunteer: { items: [] }, custom: {},
		},
		metadata: { template: 'rhyhorn', layout: [[['summary', 'experience'], ['skills']]], theme: { background: '#ffffff' }, page: { format: 'a4' } },
	};
	const [p] = I.importAny(rx, 'en');
	assert.deepEqual([p.data.personal.name, p.data.personal.title, p.data.personal.website, p.data.personal.github, p.data.personal.location, p.data.personal.photo], ['Efe Su', 'Tasarımcı', 'https://efe.su', 'https://github.com/efesu', 'Ankara', '']);
	assert.equal(p.data.summary, 'Ürün tasarımcısı.\n5 yıl & 3 ürün.');
	const e = p.data.experience[0];
	assert.deepEqual([e.company, e.role, e.start, e.end, e.current, e.bullets], ['Stüdyo', 'Tasarımcı', '2020-03', '', true, ['Arayüz çizdim', 'Test yaptım']]);
	assert.deepEqual([p.data.education[0].school, p.data.education[0].degree, p.data.education[0].start, p.data.education[0].end], ['ODTÜ', 'Lisans, Endüstri Ürünleri Tasarımı', '2015', '2019']);
	assert.deepEqual(p.data.skills.map(s => [s.group, s.items]), [['Araştırma', 'Görüşme, Anket'], ['', 'Figma']]);
	assert.deepEqual(p.data.languages.map(l => l.level), ['fluent', 'basic']);
	assert.equal(p.data.references[0].title, 'Yönetici');
	assert.equal(visibleOf(p).references, false);
	assert.equal(visibleOf(p).experience, true);
	assert.equal(p.settings.template, 'sade');
});

test('tanınmayan düzen: Türkçe ve farklı yazılmış alan adları, düz kişisel bilgiler', async () => {
	const I = await load();
	const odd = {
		resume: {
			'Ad Soyad': 'Zeynep Ak', E_Posta: 'z@ak.co', Telefon: '0555', Şehir: 'Bursa', Ülke: 'Türkiye', Ünvan: 'Öğrenci', Doğum_Tarihi: '2004-01-02T00:00:00.000Z',
			social: { linkedin: 'in/zeynep', GitHub: 'zeynepak' },
			Hakkımda: ['İlk paragraf.', 'İkinci paragraf.'],
			'İş Deneyimi': [{ Pozisyon: 'Stajyer', Şirket: 'Gama', from: { year: 2024, month: 6 }, to: { year: 2024, month: 'Eylül' }, description: '- Test yazdım\n• Hata düzelttim' }, { title: 'Garson', employer: 'Kafe', dates: '2022-2023' }],
			EĞİTİM: [{ Üniversite: 'Uludağ Üniversitesi', Bölüm: 'Endüstri Mühendisliği', period: '09/2022 - devam ediyor', Ortalama: 3.1 }],
			Yetenekler: { Diller: ['Python', 'Java'], Araçlar: 'Git, Docker' },
			Diller: 'Türkçe (Ana dil); İngilizce - B2',
			Sertifikalar: ['İSG Eğitimi'],
			hobiler: ['satranç', 'yüzme'],
		},
	};
	const [p] = I.importAny(odd, 'en');
	const per = p.data.personal;
	assert.deepEqual([per.name, per.email, per.phone, per.location, per.title, per.birthDate, per.linkedin, per.github], ['Zeynep Ak', 'z@ak.co', '0555', 'Bursa, Türkiye', 'Öğrenci', '2004-01-02', 'in/zeynep', 'zeynepak']);
	assert.equal(p.data.summary, 'İlk paragraf.\nİkinci paragraf.');
	const [a, b] = p.data.experience;
	assert.deepEqual([a.role, a.company, a.start, a.end, a.bullets], ['Stajyer', 'Gama', '2024-06', '2024-09', ['Test yazdım', 'Hata düzelttim']]);
	assert.deepEqual([b.role, b.company, b.start, b.end], ['Garson', 'Kafe', '2022', '2023']);
	const edu = p.data.education[0];
	assert.deepEqual([edu.school, edu.degree, edu.start, edu.end, edu.gpa], ['Uludağ Üniversitesi', 'Endüstri Mühendisliği', '2022-09', 'Present', '3.1']);
	assert.deepEqual(p.data.skills.map(s => [s.group, s.items]), [['Diller', 'Python, Java'], ['Araçlar', 'Git, Docker']]);
	assert.deepEqual(p.data.languages.map(l => [l.name, l.level]), [['Türkçe', 'native'], ['İngilizce', 'intermediate']]);
	assert.equal(p.data.certifications[0].name, 'İSG Eğitimi');
	assert.equal(p.data.hobbies, 'satranç, yüzme');
	assert.deepEqual(I.normalize(p, 'en'), p);
});

test('en üstte dizi, CV olmayan kişi listeleri ve tanınmayan dosyalar', async () => {
	const I = await load();
	const two = I.readImport(JSON.stringify([{ personal: { name: 'Bir' }, skills: ['a'] }, { basics: { name: 'İki', email: 'i@ki.co' } }]), 'tr');
	assert.deepEqual(two.map(p => p.name), ['Bir', 'İki']);
	// CV'nin içindeki kişi listesi (ekip, tavsiye) ayrı CV sayılmaz
	const one = I.importAny({ name: 'Asıl Kişi', email: 'a@k.co', work: [{ position: 'Dev', name: 'X' }], recommendations: [{ name: 'Öneren', email: 'o@n.co' }] }, 'tr');
	assert.deepEqual(one.map(p => p.data.personal.name), ['Asıl Kişi']);
	// Sarmalayıcıda kişi kutusu olsa da asıl CV içeride aranır
	const inner = I.importAny({ profile: { id: 7, name: 'Hesap Adı' }, resume: { basics: { name: 'Gerçek Ad' }, work: [{ position: 'Dev', name: 'X' }] } }, 'tr');
	assert.deepEqual(inner.map(p => p.data.personal.name), ['Gerçek Ad']);
	assert.throws(() => I.importAny({ foo: 1 }, 'tr'), /unknown-format/);
	assert.throws(() => I.importAny({ items: [{ id: 1, price: 3 }], total: 3 }, 'tr'), /unknown-format/);
	assert.throws(() => I.importAny([], 'tr'), /unknown-format/);
	assert.throws(() => I.importAny(null, 'tr'), /unknown-format/);
	assert.throws(() => I.readImport('merhaba', 'tr'));
	// Büyük ya da bağlantı olan fotoğraf alınmaz, CV yine gelir
	const big = I.importAny({ personalInfo: { fullName: 'Foto', profilePhoto: `data:image/png;base64,${'A'.repeat(300 * 1024)}` } }, 'tr')[0];
	assert.equal(big.data.personal.photo, '');
});

test('tarih ve seviye çevirileri', async () => {
	const I = await load();
	const dates = { 'Mar 2023': '2023-03', 'Eylül 2022': '2022-09', 'Sept. 2021': '2021-09', 'AĞUSTOS 2020': '2020-08', '2024-05-17': '2024-05', '2024-05-17T10:00:00Z': '2024-05', '05/2024': '2024-05', 2019: '2019', 'Yaz 2023': 'Yaz 2023', 'Marketing 2023': 'Marketing 2023', '': '' };
	Object.keys(dates).forEach(input => assert.equal(I.dateOf(input), dates[input], input));
	assert.equal(I.dateOf({ year: 2021, month: 3 }), '2021-03');
	assert.equal(I.dateOf(Date.UTC(2022, 6, 4)), '2022-07');
	const levels = { native: 'native', 'Ana Dil': 'native', 'AKICI': 'fluent', 'İleri (C1)': 'advanced', Orta: 'intermediate', beginner: 'basic', 'Başlangıç': 'basic', '': 'intermediate' };
	Object.keys(levels).forEach(input => assert.equal(I.levelOf(input), levels[input], input));
});
