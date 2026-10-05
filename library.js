'use strict';

const nconf = nodebb.require('nconf');
const winston = nodebb.require('winston');
const meta = nodebb.require('./src/meta');
const routeHelpers = nodebb.require('./src/routes/helpers');

const store = require('./lib/store');
const manifest = require('./static/dist/manifest.json');

const plugin = module.exports;

const assetBase = () => `${nconf.get('relative_path')}/assets/plugins/nodebb-plugin-cv-yu/static`;

plugin.init = async function (params) {
	routeHelpers.setupPageRoute(params.router, '/cv', renderPage);
};

// Sayfa kabuğu: uygulamanın kendisi (JS/CSS) yalnızca bu sayfada, önbelleklenen dosyalardan yüklenir
async function renderPage(req, res) {
	res.render('cv', {
		title: '[[cv-yu:title]]',
		breadcrumbs: [{ text: '[[global:home]]', url: `${nconf.get('relative_path')}/` }, { text: '[[cv-yu:title]]' }],
		js: `${assetBase()}/dist/${manifest.js}`,
		css: `${assetBase()}/dist/${manifest.css}`,
		fonts: `${assetBase()}/fonts/`,
		uid: req.uid > 0 ? req.uid : 0,
		defaultLang: meta.config.defaultLang || 'en-GB',
	});
}

// /api/v3/plugins/cv-yu/… — hepsi giriş ister; veri yalnızca açık onayla (consent: true) yazılır
plugin.addApiRoutes = async function ({ router, middleware, helpers }) {
	const auth = [middleware.ensureLoggedIn];

	routeHelpers.setupApiRoute(router, 'get', '/cv-yu/profiles', auth, async (req, res) => {
		helpers.formatApiResponse(200, res, await store.list(req.uid));
	});

	routeHelpers.setupApiRoute(router, 'put', '/cv-yu/profiles/:id', auth, async (req, res) => {
		const body = req.body || {};
		const result = await store.save(req.uid, req.params.id, body.profile, body.consent === true);
		helpers.formatApiResponse(200, res, result);
	});

	routeHelpers.setupApiRoute(router, 'delete', '/cv-yu/profiles/:id', auth, async (req, res) => {
		await store.remove(req.uid, req.params.id);
		helpers.formatApiResponse(200, res);
	});

	// "Verilerimi sil": hesaptaki tüm CV verisi ve onay kaydı anında silinir
	routeHelpers.setupApiRoute(router, 'delete', '/cv-yu/profiles', auth, async (req, res) => {
		await store.purge(req.uid);
		winston.info(`[plugin/cv-yu] uid ${req.uid} deleted all CV data`);
		helpers.formatApiResponse(200, res);
	});
};

// Hesap silinince CV verisi de silinir (KVKK: kişisel verinin saklanması için sebep kalmaz)
plugin.onUserDelete = async function ({ uid }) {
	await store.purge(uid);
};
