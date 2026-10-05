<!-- Dosyalar sayfa okunurken hemen inmeye başlar (page.js aynı istek biçimiyle kullanır, iki kez inmez) -->
<link rel="preload" href="{js}" as="script">
<link rel="preload" href="{css}" as="style">
<link rel="preload" href="{fonts}inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{fonts}inter-latin-ext-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<!-- data-clarity-mask: forumdaki oturum kaydı aracı (Microsoft Clarity) bu alanın içeriğini göremez; CV kişisel veridir -->
<div class="cv-yu-page" id="cv-yu-root" data-clarity-mask="True" data-js="{js}" data-css="{css}" data-fonts="{fonts}" data-uid="{uid}" data-default-lang="{defaultLang}">
	<noscript>
		<div class="alert alert-warning m-3">{{tx("cv-yu:needs-js")}}</div>
	</noscript>
	<div class="cv-yu-loading" role="status" aria-live="polite">
		<span class="cv-yu-spinner" aria-hidden="true"></span>
		<span>{{tx("cv-yu:loading")}}</span>
	</div>
</div>
