import s from './skeleton.module.css';

/**
 * Esqueletos por tipo de página (Server Components, sin hooks).
 * Cada loading.js de una ruta importa la variante que imita SU layout
 * para que el segundo de carga no deforme nada.
 */

const n = (len) => Array.from({ length: len }, (_, i) => i);

function Card() {
  return (
    <div className={s.cardSk}>
      <div className={`${s.sk} ${s.thumbSk}`} />
      <div className={s.cardBody}>
        <div className={`${s.sk} ${s.l1}`} />
        <div className={`${s.sk} ${s.l2}`} />
      </div>
    </div>
  );
}

/** Listado: head + filtros + buscador + grid 4/3/2 + ad + rail de anuncios.
 *  Flags para ajustarse a cada página real (ej. tendencias no lleva filtros). */
export function ListSkeleton({ showTools = true, showSearch = true, showSub = false, showRail = true, showAllHead = true }) {
  return (
    <main className={s.page} aria-busy="true">
      <div className={`${s.inner} ${s.listLayout}`}>
        <div className={s.listMain}>
          <div className={s.headRow}>
            <div className={s.headLeft}>
              <div className={`${s.sk} ${s.titleSk}`} />
              {showSub && <div className={`${s.sk} ${s.subSk}`} />}
            </div>
            {showTools && (
              <div className={s.tools}>
                <div className={`${s.sk} ${s.toolSk}`} />
                <div className={`${s.sk} ${s.toolSk}`} />
              </div>
            )}
          </div>
          {showSearch && <div className={`${s.sk} ${s.searchSk}`} />}
          {showAllHead && (
            <div className={s.allHeadSk}>
              <span className={s.sk} />
              <span className={s.sk} />
            </div>
          )}
          <div className={s.gridSk}>
            {n(8).map((i) => <Card key={i} />)}
          </div>
          <div className={`${s.sk} ${s.adSk}`} />
        </div>
        {showRail && (
          <div className={s.listRail}>
            <div className={`${s.sk} ${s.railBox}`} />
            <div className={`${s.sk} ${s.railBoxTall}`} />
          </div>
        )}
      </div>
    </main>
  );
}

/** Detalle: player 16:9 + info + columna de recomendados (videos/hentai/pack). */
export function DetailSkeleton({ variant = 'video' }) {
  const grid = variant === 'pack' ? s.detGridPack : s.detGrid;
  return (
    <main className={s.page} aria-busy="true">
      <div className={grid}>
        <div className={s.detLeft}>
          <div className={`${s.sk} ${s.playerSk}`} />
          <div className={`${s.sk} ${s.detTitle}`} />
          <div className={`${s.sk} ${s.detMeta}`} />
          <div className={s.chRow}>
            <div className={`${s.sk} ${s.avatarSk}`} />
            <div className={s.chLines}>
              <div className={`${s.sk} ${s.chL1}`} />
              <div className={`${s.sk} ${s.chL2}`} />
            </div>
          </div>
          <div className={s.actRow}>
            {n(5).map((i) => <div key={i} className={`${s.sk} ${s.actSk}`} />)}
          </div>
          <div className={`${s.sk} ${s.commentSk}`} />
        </div>
        <div className={s.detRight}>
          {n(3).map((i) => (
            <div key={i} className={s.miniSk}>
              <div className={`${s.sk} ${s.thumbSk}`} />
              <div className={s.miniBody}>
                <div className={`${s.sk} ${s.l1}`} />
                <div className={`${s.sk} ${s.l2}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

/** Comunidad: buscador + historias + feed + columna derecha. */
export function CommunitySkeleton() {
  return (
    <main className={`${s.page} ${s.pageComm}`} aria-busy="true">
      <div className={s.commGrid}>
        <div className={s.commMain}>
          <div className={`${s.sk} ${s.buscarSk}`} />
          <div className={s.storiesSk}>
            {n(7).map((i) => <div key={i} className={`${s.sk} ${s.storySk}`} />)}
          </div>
          <div className={`${s.sk} ${s.labelSk}`} />
          <div className={s.postSk}>
            <div className={s.postHead}>
              <div className={`${s.sk} ${s.postAvatar}`} />
              <div className={s.postLines}>
                <div className={`${s.sk} ${s.l1}`} />
                <div className={`${s.sk} ${s.l2}`} />
              </div>
            </div>
            <div className={`${s.sk} ${s.postMedia}`} />
          </div>
          <div className={s.postSk}>
            <div className={s.postHead}>
              <div className={`${s.sk} ${s.postAvatar}`} />
              <div className={s.postLines}>
                <div className={`${s.sk} ${s.l1}`} />
                <div className={`${s.sk} ${s.l2}`} />
              </div>
            </div>
            <div className={`${s.sk} ${s.postText}`} />
            <div className={`${s.sk} ${s.postText}`} />
          </div>
        </div>
        <div className={s.commRight}>
          <div className={s.rightBox}>
            <span className={s.sk} />
            <span className={s.sk} />
            <span className={s.sk} />
          </div>
          <div className={s.rightBox}>
            <span className={s.sk} />
            <span className={s.sk} />
          </div>
        </div>
      </div>
    </main>
  );
}

/** Chat: lista de conversaciones + panel derecho (placeholder). */
export function ChatSkeleton() {
  return (
    <div className={s.chatWrap} aria-busy="true">
      <div className={s.chatLeft}>
        <div className={`${s.sk} ${s.chatSearch}`} />
        {n(6).map((i) => (
          <div key={i} className={s.convRow}>
            <div className={`${s.sk} ${s.convAvatar}`} />
            <div className={s.convLines}>
              <div className={`${s.sk} ${s.convL1}`} />
              <div className={`${s.sk} ${s.convL2}`} />
            </div>
          </div>
        ))}
      </div>
      <div className={s.chatRight}>
        <div className={`${s.sk} ${s.chatCircle}`} />
        <div className={`${s.sk} ${s.chatLine}`} />
      </div>
    </div>
  );
}

/** Genérico compacto para rutas sin esqueleto propio (nada gigante). */
export function GenericSkeleton() {
  return (
    <main className={s.page} aria-busy="true">
      <div className={s.inner}>
        <div className={`${s.sk} ${s.genTitle}`} />
        <div className={`${s.sk} ${s.genSearch}`} />
        <div className={s.genGrid}>
          {n(6).map((i) => <Card key={i} />)}
        </div>
        <div className={`${s.sk} ${s.genBlock}`} />
      </div>
    </main>
  );
}
