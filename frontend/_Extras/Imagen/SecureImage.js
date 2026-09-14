'use client';

import { useEffect, useRef, useState } from 'react';

function clamp01(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

/**
 * Imagen "segura": se dibuja en un <canvas> (no hay <img src> en el DOM),
 * con menú contextual y arrastre bloqueados. Sirve como visor con zoom/pan.
 * pos: { x, y } en 0..1 (0 = borde izquierdo/arriba, 1 = derecho/abajo).
 */
export default function SecureImage({ src, className, style, fit = 'cover', zoom = 1, pos = { x: 0.5, y: 0 }, fill = false, onReady, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [img, setImg] = useState(null);

  useEffect(() => {
    if (!src) { setImg(null); return; }
    let alive = true;
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => { if (alive) { setImg(el); onReady?.(el); } };
    el.onerror = () => { if (alive) setImg(null); };
    el.src = src;
    return () => { alive = false; el.onload = null; el.onerror = null; };
  }, [src]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = box;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!img || !w || !h || !img.naturalWidth) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const base = fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
    const s = base * zoom;
    const W = iw * s;
    const H = ih * s;
    const ox = (w - W) * clamp01(pos.x);
    const oy = (h - H) * clamp01(pos.y);
    ctx.drawImage(img, ox, oy, W, H);
  }, [img, box, zoom, pos.x, pos.y, fit]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: fill ? 'absolute' : 'relative',
        inset: fill ? 0 : 'auto',
        overflow: 'hidden',
        ...style,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
      />
    </div>
  );
}
