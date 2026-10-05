// Tutup sürükleyerek sıralama. Pointer Events kullanır: fare, dokunmatik ve kalemle aynı çalışır
// (HTML5 sürükle-bırak Android'de yok, iOS'ta tutarsız). Klavye: tutamaç odaktayken ↑/↓ taşır.
// Liste öğeleri data-sort-item taşır; kaydırma alanı data-sort-scroll ile işaretlenir.
import { useMemo, useRef } from 'preact/hooks';

const EDGE = 56; // kaydırma alanının kenarına bu kadar yaklaşınca otomatik kaydır
const MAX_SPEED = 22;

function itemsOf(handle) {
	const item = handle.closest('[data-sort-item]');
	const list = item && item.parentElement;
	if (!list) return null;
	const items = Array.from(list.children).filter(n => n.hasAttribute('data-sort-item'));
	return { item, list, items, index: items.indexOf(item) };
}

function refocus(list, key) {
	requestAnimationFrame(() => {
		const el = list.querySelector(`[data-sort-key="${key}"]`);
		if (el) el.focus();
	});
}

function layout(d) {
	const dy = d.y - d.y0 + (d.scroller.scrollTop - d.s0);
	const { from, tops, heights, items } = d;
	const center = tops[from] + (heights[from] / 2) + dy;
	let to = from;
	for (let i = 0; i < items.length; i += 1) {
		const mid = tops[i] + (heights[i] / 2);
		if (i < from && center < mid) to = Math.min(to, i);
		if (i > from && center > mid) to = Math.max(to, i);
	}
	d.to = to;
	const slot = heights[from] + d.gap;
	items.forEach((n, i) => {
		let shift = 0;
		if (i === from) shift = dy;
		else if (from < to && i > from && i <= to) shift = -slot;
		else if (to < from && i >= to && i < from) shift = slot;
		n.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : '';
	});
}

export function useSortable(onMove) {
	const moveRef = useRef(onMove);
	moveRef.current = onMove;

	return useMemo(() => {
		function finish(d, commit) {
			cancelAnimationFrame(d.raf);
			d.cleanup();
			// Önce geçiş animasyonunu kapat, sonra kaydırmaları sil: yeni sıra zıplamadan yerine oturur
			d.list.classList.remove('is-sorting');
			d.items.forEach((n) => { n.style.transform = ''; n.classList.remove('is-dragging'); });
			if (commit && d.to !== d.from) {
				moveRef.current(d.from, d.to);
				refocus(d.list, d.key);
			}
		}

		function tick(d) {
			const box = d.scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : d.scroller.getBoundingClientRect();
			let v = 0;
			if (d.y < box.top + EDGE) v = -Math.min(MAX_SPEED, Math.ceil((box.top + EDGE - d.y) / 3));
			else if (d.y > box.bottom - EDGE) v = Math.min(MAX_SPEED, Math.ceil((d.y - (box.bottom - EDGE)) / 3));
			if (v) {
				const before = d.scroller.scrollTop;
				d.scroller.scrollTop += v;
				if (d.scroller.scrollTop !== before) layout(d);
			}
			d.raf = requestAnimationFrame(() => tick(d));
		}

		function onPointerDown(e) {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			const handle = e.currentTarget;
			const found = itemsOf(handle);
			if (!found || found.items.length < 2) return;
			e.preventDefault();
			const { item, list, items, index } = found;
			// Masaüstünde panel kendi içinde kayar; telefonda panel uzar ve sayfa kayar
			const panel = list.closest('[data-sort-scroll]');
			const scroller = panel && getComputedStyle(panel).overflowY !== 'visible' && panel.scrollHeight > panel.clientHeight ? panel : document.scrollingElement;
			const s0 = scroller.scrollTop;
			const tops = items.map(n => n.getBoundingClientRect().top + s0);
			const heights = items.map(n => n.offsetHeight);
			const d = {
				list, items, item, scroller, s0, tops, heights,
				gap: Math.max(0, tops[1] - tops[0] - heights[0]),
				from: index, to: index, y0: e.clientY, y: e.clientY, raf: 0, key: handle.dataset.sortKey,
			};
			try { handle.setPointerCapture(e.pointerId); } catch (err) { /* eski tarayıcı: belge düzeyinde dinlemeye gerek yok, olaylar yine tutamaçta */ }
			const move = (ev) => { d.y = ev.clientY; layout(d); };
			const up = () => finish(d, true);
			const cancel = () => finish(d, false);
			d.cleanup = () => {
				handle.removeEventListener('pointermove', move);
				handle.removeEventListener('pointerup', up);
				handle.removeEventListener('pointercancel', cancel);
			};
			handle.addEventListener('pointermove', move);
			handle.addEventListener('pointerup', up);
			handle.addEventListener('pointercancel', cancel);
			list.classList.add('is-sorting');
			item.classList.add('is-dragging');
			d.raf = requestAnimationFrame(() => tick(d));
		}

		function onKeyDown(e) {
			if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
			const found = itemsOf(e.currentTarget);
			if (!found) return;
			const to = found.index + (e.key === 'ArrowUp' ? -1 : 1);
			e.preventDefault();
			if (to < 0 || to >= found.items.length) return;
			moveRef.current(found.index, to);
			refocus(found.list, e.currentTarget.dataset.sortKey);
		}

		return { onPointerDown, onKeyDown };
	}, []);
}

export function moveItem(list, from, to) {
	const next = list.slice();
	const [x] = next.splice(from, 1);
	next.splice(to, 0, x);
	return next;
}
