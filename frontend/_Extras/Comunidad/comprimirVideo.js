/**
 * Convierte un video a CALIDAD MEDIA (720p, ~1.6 Mbps) antes de subirlo.
 * Las publicaciones no son peliculas: no tiene sentido subir 1080p/4K.
 *
 * Sin dependencias: graba el video del navegador con MediaRecorder
 * (canvas 720p + audio capturado). Si el navegador no lo soporta, si el
 * archivo ya es pequeno o si algo falla, devuelve el archivo original.
 *
 * @param {File}      file       archivo de video
 * @param {(p:number)=>void} [onProgress]  avance 0..1 mientras se convierte
 * @returns {Promise<File>} el archivo convertido (o el original)
 */
export async function comprimirVideo(file, onProgress) {
  let url = null;   // blob del video original (se libera siempre)
  let actx = null;  // contexto de audio (se cierra siempre)
  let raf = 0;      // animacion de dibujo del canvas
  try {
    if (!file || !/^video\//.test(String(file.type || ''))) return file;
    if (typeof MediaRecorder === 'undefined'
      || typeof HTMLCanvasElement === 'undefined'
      || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return file;

    const mime = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ].find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } });
    if (!mime) return file;

    url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.src = url;
    v.preload = 'auto';
    v.playsInline = true;

    const meta = await new Promise((resolve) => {
      const ok = () => resolve(true);
      const mal = () => resolve(false);
      v.onloadedmetadata = ok;
      v.onerror = mal;
      setTimeout(mal, 15000);
    });

    // Ya es calidad media (o mas chica): no gaste tiempo regrabando.
    const yaEsMedia = Number.isFinite(v.videoHeight)
      && v.videoHeight > 0 && v.videoHeight <= 720 && file.size <= 25 * 1024 * 1024;
    if (!meta || yaEsMedia || !Number.isFinite(v.duration) || v.duration <= 0) return file;

    // Escala a 720p manteniendo la proporcion.
    const alto = 720;
    const ancho = Math.max(2, Math.round((v.videoWidth / v.videoHeight) * alto / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    const cStream = canvas.captureStream(30);

    // Audio: se manda solo al grabador (no se escucha mientras convierte).
    // Si no se puede capturar el audio, mejor NO convertir: nunca perder sonido.
    let aStream = null;
    try {
      actx = new AudioContext();
      await actx.resume();
      const nodo = actx.createMediaElementSource(v);
      const destino = actx.createMediaStreamDestination();
      nodo.connect(destino);
      aStream = destino.stream;
    } catch { return file; }

    const tracks = [...cStream.getVideoTracks()];
    if (aStream) tracks.push(...aStream.getAudioTracks());
    const rec = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mime,
      videoBitsPerSecond: 1600000, // ~1.6 Mbps: calidad media, pesa poco
    });
    const pedazos = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) pedazos.push(e.data); };
    const finRec = new Promise((res) => { rec.onstop = res; });

    const pintar = () => {
      try { ctx.drawImage(v, 0, 0, ancho, alto); } catch { /* frame no disponible */ }
      raf = requestAnimationFrame(pintar);
    };

    const listo = new Promise((resolve) => {
      v.oncanplay = () => resolve(true);
      v.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 15000);
    });
    await listo;

    rec.start(250);
    pintar();
    v.currentTime = 0;
    await v.play();

    // Avance mientras dura la grabacion (es en tiempo real).
    const avance = setInterval(() => {
      if (v.duration > 0 && onProgress) onProgress(Math.min(1, v.currentTime / v.duration));
    }, 300);

    await new Promise((resolve) => {
      const parar = () => resolve();
      v.onended = parar;
      v.onerror = parar;
      // Corta de golpe si algo se queda colgado.
      setTimeout(parar, (v.duration + 30) * 1000);
    });

    clearInterval(avance);
    try { if (rec.state !== 'inactive') rec.stop(); } catch { /* ya paro */ }
    await finRec;
    if (onProgress) onProgress(1);

    const blob = new Blob(pedazos, { type: mime.split(';')[0] });
    if (!blob.size || blob.size >= file.size) return file; // no gano nada: sube el original
    const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
    const base = String(file.name || 'video').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } catch {
    // Cualquier fallo: se sube el archivo tal cual.
    return file;
  } finally {
    if (raf) { try { cancelAnimationFrame(raf); } catch { /* noop */ } }
    if (url) { try { URL.revokeObjectURL(url); } catch { /* noop */ } }
    if (actx) { try { await actx.close(); } catch { /* noop */ } }
  }
}
