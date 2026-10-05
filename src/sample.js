// İlk açılışta gelen örnek CV (uydurma kişi). Kişi içeriği kendi bilgileriyle değiştirerek başlar;
// iyi bir CV'nin nasıl göründüğünü (eylemle başlayan, sayılı maddeler) gösterir.
import { newProfile, normalize, uid } from './model.js';

const TR = {
	personal: { name: 'Elif Kaya', title: 'Yazılım Mühendisliği Öğrencisi', location: 'İzmir, Türkiye', email: 'elif.kaya@example.com', phone: '+90 555 123 45 67', linkedin: 'linkedin.com/in/elifkaya', github: 'github.com/elifkaya', website: '', nationality: '', license: '', birthDate: '', photo: '' },
	summary: 'Yaşar Üniversitesi Yazılım Mühendisliği 3. sınıf öğrencisiyim. Web uygulamaları ve veri işleme üzerine iki öğrenci projesi geliştirdim; takım hâlinde çalışmayı ve ürünü uçtan uca teslim etmeyi seviyorum. 2027 yazı için yazılım stajı arıyorum.',
	experience: [
		{ role: 'Yazılım Stajyeri', company: 'Örnek Teknoloji A.Ş.', location: 'İzmir', start: '2025-07', end: '2025-09', current: false, bullets: ['React ile yazılan iç raporlama ekranını yeniden düzenleyerek sayfa açılışını 2,1 saniyeden 0,8 saniyeye indirdim.', 'Node.js API\'sine 14 birim testi ekledim; test kapsamı %41\'den %73\'e çıktı.'] },
		{ role: 'Öğrenci Asistanı', company: 'Yaşar Üniversitesi, Yazılım Müh. Bölümü', location: 'İzmir', start: '2024-10', end: '', current: true, bullets: ['60 öğrencinin laboratuvar çalışmalarını değerlendirdim ve ofis saatleri düzenledim.'] },
	],
	projects: [
		{ name: 'Kampüs Ring Takip', link: 'github.com/elifkaya/ring', start: '2025-03', end: '2025-06', bullets: ['Servis saatlerini gösteren PWA; Vue ve Firebase ile 3 kişilik ekipte geliştirildi, 400+ öğrenci kullandı.'] },
	],
	education: [{ degree: 'Yazılım Mühendisliği, Lisans', school: 'Yaşar Üniversitesi', location: 'İzmir', start: '2023-09', end: '2027-06', gpa: '3,42 / 4', bullets: ['Veri Yapıları, Veritabanı Sistemleri, Web Programlama'] }],
	involvement: [{ role: 'Etkinlik Sorumlusu', org: 'Yaşar IEEE Öğrenci Kolu', start: '2024-10', end: '', bullets: ['200 katılımcılı hackathonun sponsorluk ve lojistik süreçlerini yürüttüm.'] }],
	skills: [{ group: 'Programlama', items: 'JavaScript, TypeScript, Python, SQL' }, { group: 'Araçlar', items: 'React, Node.js, Git, Docker, Figma' }],
	certifications: [{ name: 'AWS Cloud Practitioner', issuer: 'Amazon Web Services', date: '2025-05', link: '' }],
	languages: [{ name: 'Türkçe', level: 'native' }, { name: 'İngilizce', level: 'advanced' }],
	awards: [],
	references: [],
	hobbies: 'Dağ bisikleti, satranç, açık kaynak katkıları',
};

const EN = {
	personal: { name: 'Elif Kaya', title: 'Software Engineering Student', location: 'Izmir, Türkiye', email: 'elif.kaya@example.com', phone: '+90 555 123 45 67', linkedin: 'linkedin.com/in/elifkaya', github: 'github.com/elifkaya', website: '', nationality: '', license: '', birthDate: '', photo: '' },
	summary: 'Third-year Software Engineering student at Yaşar University. I have built two student projects on web apps and data processing, and I enjoy working in a team and shipping a product end to end. Looking for a software internship for summer 2027.',
	experience: [
		{ role: 'Software Engineering Intern', company: 'Example Technology Inc.', location: 'Izmir', start: '2025-07', end: '2025-09', current: false, bullets: ['Reworked an internal React reporting page, cutting load time from 2.1 s to 0.8 s.', 'Added 14 unit tests to a Node.js API, raising coverage from 41% to 73%.'] },
		{ role: 'Teaching Assistant', company: 'Yaşar University, Software Engineering', location: 'Izmir', start: '2024-10', end: '', current: true, bullets: ['Graded lab work for 60 students and ran weekly office hours.'] },
	],
	projects: [
		{ name: 'Campus Shuttle Tracker', link: 'github.com/elifkaya/ring', start: '2025-03', end: '2025-06', bullets: ['PWA showing shuttle times, built with Vue and Firebase in a team of three; used by 400+ students.'] },
	],
	education: [{ degree: 'BSc Software Engineering', school: 'Yaşar University', location: 'Izmir', start: '2023-09', end: '2027-06', gpa: '3.42 / 4', bullets: ['Data Structures, Database Systems, Web Programming'] }],
	involvement: [{ role: 'Events Lead', org: 'Yaşar IEEE Student Branch', start: '2024-10', end: '', bullets: ['Ran sponsorship and logistics for a 200-person hackathon.'] }],
	skills: [{ group: 'Programming', items: 'JavaScript, TypeScript, Python, SQL' }, { group: 'Tools', items: 'React, Node.js, Git, Docker, Figma' }],
	certifications: [{ name: 'AWS Cloud Practitioner', issuer: 'Amazon Web Services', date: '2025-05', link: '' }],
	languages: [{ name: 'Turkish', level: 'native' }, { name: 'English', level: 'advanced' }],
	awards: [],
	references: [],
	hobbies: 'Mountain biking, chess, open-source contributions',
};

const withIds = list => list.map(item => ({ ...item, id: uid() }));

export function sampleProfile(name, lang) {
	const src = lang === 'tr' ? TR : EN;
	const base = newProfile(name, lang);
	const data = { ...base.data, personal: { ...src.personal }, summary: src.summary, hobbies: src.hobbies };
	['experience', 'projects', 'education', 'involvement', 'skills', 'certifications', 'languages', 'awards', 'references'].forEach((k) => { data[k] = withIds(src[k]); });
	return normalize({ ...base, data }, lang);
}
