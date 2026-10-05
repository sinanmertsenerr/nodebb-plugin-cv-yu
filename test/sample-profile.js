// Test verisi (uydurma kişi). Harness ve yazdırma testleri bunu kullanır.
window.SAMPLE_PROFILE = {
	id: 'ornek1', name: 'Elif Kaya – Staj', updatedAt: 1,
	settings: { template: 'sade', lang: 'tr', theme: { primary: '#1f2a37', accent: '#1a5fb4', font: 'inter', size: 'm', spacing: 'm', margins: 'm', titleStyle: 'caps', icons: true, photoShape: 'circle', photoSize: 'm' } },
	data: {
		personal: { name: 'Elif Kaya', title: 'Yazılım Mühendisliği Öğrencisi', location: 'İzmir, Türkiye', email: 'elif.kaya@example.com', phone: '+90 555 123 45 67', linkedin: 'linkedin.com/in/elifkaya', github: 'github.com/elifkaya', website: '', nationality: '', license: 'B', birthDate: '2003', photo: '' },
		summary: 'Yaşar Üniversitesi Yazılım Mühendisliği 3. sınıf öğrencisiyim. Web uygulamaları ve veri işleme üzerine iki öğrenci projesi geliştirdim; takım halinde çalışmayı ve ürünü uçtan uca teslim etmeyi seviyorum. 2027 yazı için yazılım stajı arıyorum.',
		experience: [
			{ id: 'e1', role: 'Yazılım Stajyeri', company: 'Örnek Teknoloji A.Ş.', location: 'İzmir', start: '2025-07', end: '2025-09', current: false, bullets: ['React ile yazılan iç raporlama ekranını yeniden düzenleyerek sayfa açılışını 2,1 saniyeden 0,8 saniyeye indirdim.', 'Node.js API\'sine 14 birim testi ekledim; test kapsamı %41\'den %73\'e çıktı.', 'Haftalık sprint toplantılarında 4 kişilik ekibe ilerleme raporu sundum.'] },
			{ id: 'e2', role: 'Öğrenci Asistanı', company: 'Yaşar Üniversitesi, Yazılım Müh. Bölümü', location: 'İzmir', start: '2024-10', end: '', current: true, bullets: ['SE 115 dersinde 60 öğrencinin laboratuvar çalışmalarını değerlendirdim ve ofis saatleri düzenledim.', 'Ders materyalleri için 12 örnek problem ve çözüm hazırladım.'] },
		],
		projects: [
			{ id: 'p1', name: 'Kampüs Ring Takip', link: 'github.com/elifkaya/ring', start: '2025-03', end: '2025-06', bullets: ['Servis saatlerini gösteren PWA; Vue ve Firebase ile 3 kişilik ekipte geliştirildi, 400+ öğrenci kullandı.', 'Konum verisini 30 saniyede bir güncelleyen arka plan görevi yazdım.'] },
			{ id: 'p2', name: 'Ders Programı Planlayıcı', link: '', start: '2024-11', end: '2025-01', bullets: ['Çakışmayan ders programı üreten Python aracı; 1.000+ ders kombinasyonunu 1 saniyenin altında tarar.'] },
		],
		education: [{ id: 'ed1', degree: 'Yazılım Mühendisliği, Lisans', school: 'Yaşar Üniversitesi', location: 'İzmir', start: '2023-09', end: '2027-06', gpa: '3,42 / 4', bullets: ['Veri Yapıları, Veritabanı Sistemleri, Web Programlama, Yazılım Mimarisi'] }],
		involvement: [{ id: 'i1', role: 'Etkinlik Sorumlusu', org: 'Yaşar IEEE Öğrenci Kolu', start: '2024-10', end: '', bullets: ['200 katılımcılı "Hack Yaşar" hackathonunun sponsorluk ve lojistik süreçlerini yürüttüm.'] }],
		skills: [{ id: 's1', group: 'Programlama', items: 'JavaScript, TypeScript, Python, Java, SQL' }, { id: 's2', group: 'Web', items: 'React, Vue, Node.js, Express, REST' }, { id: 's3', group: 'Araçlar', items: 'Git, Docker, PostgreSQL, Firebase, Figma' }],
		certifications: [{ id: 'c1', name: 'AWS Cloud Practitioner', issuer: 'Amazon Web Services', date: '2025-05', link: '' }, { id: 'c2', name: 'Google UX Design', issuer: 'Coursera', date: '2024-12', link: '' }],
		languages: [{ id: 'l1', name: 'Türkçe', level: 'native' }, { id: 'l2', name: 'İngilizce', level: 'advanced' }, { id: 'l3', name: 'Almanca', level: 'basic' }],
		awards: [{ id: 'a1', name: 'Hack Yaşar 2025 – İkincilik', issuer: 'Yaşar Üniversitesi', date: '2025-04', note: 'Kampüs ring takip uygulamasıyla' }],
		hobbies: 'Dağ bisikleti, satranç, açık kaynak katkıları',
		references: [],
		sections: ['summary', 'experience', 'projects', 'education', 'involvement', 'skills', 'certifications', 'languages', 'awards', 'hobbies', 'references'].map(t => ({ type: t, visible: t !== 'references', title: '' })),
	},
};
