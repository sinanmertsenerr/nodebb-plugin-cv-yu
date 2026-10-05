// dump-dom için: ölçüm sonuçlarını başlığa yaz
setTimeout(function () {
  var m = document.querySelector('.cv-page--measure');
  var cols = m ? [].slice.call(m.querySelectorAll('[data-col]')) : [];
  var info = cols.map(function (c) { return c.dataset.col + ':' + c.children.length + ':' + [].slice.call(c.children).reduce(function (a, b) { return a + b.offsetHeight; }, 0); });
  var pages = document.querySelectorAll('.cv-page:not(.cv-page--measure)').length;
  var first = document.querySelector('.cv-page:not(.cv-page--measure) .cv-col');
  document.title = 'pages=' + pages + ' measure=' + info.join(',') + ' firstColScroll=' + (first ? first.scrollHeight : '-') + ' fonts=' + document.fonts.check('13px Inter') + ' media=' + (matchMedia('print').matches ? 'print' : 'screen') + ' w=' + innerWidth;
}, 2500);
