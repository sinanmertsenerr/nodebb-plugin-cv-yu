'use strict';

// /cv sayfasının NodeBB modülü. Uygulamanın kendisi büyük olduğu için her sayfaya gömülmez;
// burada yalnızca bu sayfada, özetli (önbelleklenen) dosyalardan yüklenir ve bağlanır.
define('forum/cv', ['hooks'], function (hooks) {
	const Page = {};
	let mounted = false;

	function loadOnce(tag, attrs, key) {
		return new Promise(function (resolve, reject) {
			const existing = document.querySelector(`${tag}[data-cv-yu="${key}"]`);
			if (existing) {
				if (existing.dataset.ready === '1') {
					return resolve();
				}
				existing.addEventListener('load', () => resolve());
				existing.addEventListener('error', () => reject(new Error(`cv-yu: ${key} failed`)));
				return;
			}
			const el = document.createElement(tag);
			Object.keys(attrs).forEach((k) => { el.setAttribute(k, attrs[k]); });
			el.dataset.cvYu = key;
			el.addEventListener('load', () => { el.dataset.ready = '1'; resolve(); });
			el.addEventListener('error', () => reject(new Error(`cv-yu: ${key} failed`)));
			document.head.appendChild(el);
		});
	}

	Page.init = async function () {
		const root = document.getElementById('cv-yu-root');
		if (!root) {
			return;
		}
		try {
			await Promise.all([
				loadOnce('link', { rel: 'stylesheet', href: root.dataset.css }, 'css'),
				loadOnce('script', { src: root.dataset.js, defer: '' }, 'js'),
			]);
			window.YuCV.mount(root, {
				uid: parseInt(root.dataset.uid, 10) || 0,
				relativePath: config.relative_path || '',
				csrf: config.csrf_token,
				uiLang: config.userLang || root.dataset.defaultLang || 'en-GB',
				fonts: root.dataset.fonts,
			});
			mounted = true;
		} catch (err) {
			root.innerHTML = `<div class="alert alert-danger m-3">${err.message}</div>`;
		}
	};

	hooks.on('action:ajaxify.start', function () {
		if (mounted && window.YuCV) {
			window.YuCV.unmount();
			mounted = false;
		}
	});

	return Page;
});
