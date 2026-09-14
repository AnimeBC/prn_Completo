'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './ImageCropModal.module.css';

const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));

/**
 * Modal para encuadrar una imagen (arrastrar + zoom) antes de guardarla.
 * shape: 'circle' (avatar cuadrado) | 'banner' (panorámica).
 * onSave(blob) devuelve ya recortada la imagen al tamaño final.
 */
export default function ImageCropModal({
  open,
  file,
  shape = 'circle',
  outputSize = 512,
  title = 'Ajusta tu foto',
  subtitle = 'Arrastra para elegir qué parte se ve y usa el zoom.',
  onCancel,
  onSave,
}) {
  const frameRef = useRef(null);
  const [src, setSrc] = useState('');
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const dragRef = useRef(null);

  const ratio = shape === 'banner' ? 16 / 5 : 1;

  useEffect(() => {
    if (!open || !file) { setSrc(''); return; }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setPos({ x: 50, y: 50 });
    setZoom(1);
    setNat({ w: 0, h: 0 });
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  useEffect(() => {
    if (!open || !src) return;
    const measure = () => {
      const el = frameRef.current;
      if (el) setFrame({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && frameRef.current) ro.observe(frameRef.current);
    window.addEventListener('resize', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !file) return null;

  const scale0 = nat.w && nat.h && frame.w ? Math.max(frame.w / nat.w, frame.h / nat.h) : 0;
  const s = scale0 * zoom;
  const W = s * nat.w;
  const H = s * nat.h;
  const offX = (frame.w - W) * (pos.x / 100);
  const offY = (frame.h - H) * (pos.y / 100);

  function startDrag(e) {
    e.preventDefault();
    dragRef.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
  }
  function moveDrag(e) {
    const d = dragRef.current;
    if (!d || !frame.w || !frame.h) return;
    const dx = ((e.clientX - d.x) / frame.w) * 100;
    const dy = ((e.clientY - d.y) / frame.h) * 100;
    setPos({ x: clamp(d.px - dx), y: clamp(d.py - dy) });
  }
  function endDrag(e) {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
  }

  function handleSave() {
    if (!nat.w || !frame.w) return;
    setBusy(true);
    const ow = outputSize;
    const oh = shape === 'banner' ? Math.round(outputSize / ratio) : outputSize;
    const img = new Image();
    img.onload = () => {
      const k = ow / frame.w;
      const canvas = document.createElement('canvas');
      canvas.width = ow;
      canvas.height = oh;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ow, oh);
      ctx.drawImage(img, offX * k, offY * k, W * k, H * k);
      canvas.toBlob((blob) => {
        setBusy(false);
        if (blob) onSave(blob);
      }, 'image/jpeg', 0.92);
    };
    img.onerror = () => setBusy(false);
    img.src = src;
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={styles.card}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.sub}>{subtitle}</p>

        <div className={styles.stage}>
          <div
            ref={frameRef}
            className={`${styles.frame} ${shape === 'circle' ? styles.circle : ''}`}
            style={{ aspectRatio: ratio }}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {src && (
              <img
                className={styles.img}
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                style={{
                  width: W || 'auto',
                  height: H || 'auto',
                  left: offX || 0,
                  top: offY || 0,
                }}
              />
            )}
          </div>
        </div>

        <div className={styles.zoomRow}>
          <ion-icon name="remove-outline" suppressHydrationWarning></ion-icon>
          <input
            className={styles.zoom}
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            aria-label="Zoom"
          />
          <ion-icon name="add-outline" suppressHydrationWarning></ion-icon>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className={styles.save} onClick={handleSave} disabled={busy || !nat.w}>
            <ion-icon name={busy ? 'sync-outline' : 'checkmark-outline'} className={busy ? styles.spin : ''} suppressHydrationWarning></ion-icon>
            {busy ? 'Guardando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
