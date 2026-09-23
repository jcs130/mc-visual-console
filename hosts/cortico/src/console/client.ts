/**
 * 控制台面板（浏览器侧）。只经 `ctx` 与宿主说话：DOM 写进 `ctx.root`，数据走
 * `ctx.invoke` / `ctx.stream`，定时与帧走 `ctx.interval` / `ctx.frame`。
 * 对 `cortico/*` 只能 `import type`。
 *
 * 面板 id 与 `world.ts` 里声明的两个面板一一对应：`scene` / `control`。
 */
import type {
  ConsoleClientBundle,
  ConsolePanelContext,
  ConsoleStreamHandle,
} from 'cortico/web/shared/client-panel.ts';

/** 接缝协议里的快照形状（见 mc-visual-console 的 docs/PROTOCOL.md）。 */
interface Snapshot {
  seq?: number;
  bot?: {
    username?: string;
    position?: [number, number, number];
    yaw?: number;
    health?: number;
    food?: number;
  };
  holder?: string | null;
  viewDistance?: number;
  entities?: Array<{ id?: number | string; name?: string; type?: string; position?: [number, number, number] }>;
  blocks?: Array<{ pos: [number, number, number]; name: string }>;
}

interface Frame {
  type?: string;
  snapshot?: Snapshot;
  holder?: string | null;
  reason?: string;
  delta?: { bot?: Snapshot['bot']; entities?: Snapshot['entities']; blocks?: Snapshot['blocks'] };
  seq?: number;
  level?: string;
  text?: string;
  code?: string;
  message?: string;
}

interface SceneState {
  snapshot: Snapshot | null;
  connected: boolean;
  note: string;
  seq: number;
  lastAt: number;
}

function reduceFrame(state: SceneState, frame: Frame): SceneState {
  switch (frame.type) {
    case 'hello':
      return { ...state, snapshot: frame.snapshot ?? state.snapshot, connected: true, note: '已连接接缝', seq: frame.snapshot?.seq ?? state.seq, lastAt: Date.now() };
    case 'delta': {
      const merged: Snapshot = { ...(state.snapshot ?? {}) };
      if (frame.delta?.bot) merged.bot = { ...(merged.bot ?? {}), ...frame.delta.bot };
      if (frame.delta?.entities) merged.entities = frame.delta.entities;
      if (frame.delta?.blocks) merged.blocks = frame.delta.blocks;
      return { ...state, snapshot: merged, connected: true, note: '', seq: frame.seq ?? state.seq, lastAt: Date.now() };
    }
    case 'holder':
      return {
        ...state,
        connected: true,
        note: frame.holder ? `接管者：${frame.holder}` : `无人接管${frame.reason ? `（${frame.reason}）` : ''}`,
        snapshot: state.snapshot ? { ...state.snapshot, holder: frame.holder ?? null } : state.snapshot,
        lastAt: Date.now(),
      };
    case 'notice':
      return { ...state, note: frame.text ?? '', lastAt: Date.now() };
    case 'error':
      return { ...state, note: `命令被拒：${frame.code ?? ''} ${frame.message ?? ''}`.trim(), lastAt: Date.now() };
    default:
      return state;
  }
}

const panels: ConsoleClientBundle['panels'] = {
  /** 画面：这一路观战身份看到的世界。 */
  scene: {
    mount(ctx: ConsolePanelContext) {
      const state: SceneState = { snapshot: null, connected: false, note: '', seq: 0, lastAt: 0 };

      const sheet = ctx.ui.sheet({ title: '画面', desc: '与这一路观战身份的感知是同一份；方块名已过门的翻译。' });
      const facts = ctx.ui.kv([]);
      sheet.body.append(facts);

      const canvas = ctx.ui.h('canvas');
      canvas.className = 'mcvisual-minimap';
      canvas.width = 320;
      canvas.height = 320;
      const wrap = ctx.ui.h('div', 'mcvisual-mapwrap');
      wrap.append(canvas);
      const caption = ctx.ui.h('div', 'mcvisual-caption', '尚未收到快照。');
      wrap.append(caption);
      sheet.body.append(wrap);

      const note = ctx.ui.msgline('');
      sheet.body.append(note);
      ctx.root.append(sheet.el);

      const redraw = () => {
        const snap = state.snapshot;
        const holder = snap?.holder ?? null;
        facts.replaceChildren(
          ...Array.from(ctx.ui
            .kv([
              { k: '接缝', v: state.connected ? ctx.ui.pill('已连接', 'on') : ctx.ui.pill('未连接', 'off') },
              { k: '身份', v: snap?.bot?.username ?? '—' },
              { k: '接管', v: holder ? ctx.ui.pill(holder, 'on') : ctx.ui.pill('只读观战', 'plain') },
              { k: '序号', v: state.seq || '—' },
            ])
            .querySelectorAll('tr'),)
        );
        note.textContent = state.note;
        note.classList.toggle('bad', state.note.startsWith('命令被拒'));

        const g = canvas.getContext('2d');
        if (!g) return;
        const size = canvas.width;
        g.clearRect(0, 0, size, size);
        g.fillStyle = 'rgba(12,16,20,0.9)';
        g.fillRect(0, 0, size, size);
        const pos = snap?.bot?.position;
        if (!pos) {
          caption.textContent = '尚未收到快照。';
          return;
        }
        const view = Math.max(4, Math.min(32, snap?.viewDistance ?? 8));
        const [bx, , bz] = pos;
        const toScreen = (x: number, z: number): [number, number] => [
          size / 2 + ((x - bx) / view) * (size / 2),
          size / 2 + ((z - bz) / view) * (size / 2),
        ];

        // 方块（稀疏）：每种方块名一个色相，够看结构就行。
        for (const block of snap?.blocks ?? []) {
          const [x, y, z] = block.pos;
          const dx = x - bx;
          const dz = z - bz;
          if (Math.abs(dx) > view || Math.abs(dz) > view) continue;
          const [sx, sy] = toScreen(x, z);
          g.fillStyle = colorFor(block.name, y);
          g.fillRect(sx - 2, sy - 2, 4, 4);
        }

        // 实体
        for (const entity of snap?.entities ?? []) {
          const p = entity.position;
          if (!p) continue;
          const [sx, sy] = toScreen(p[0], p[2]);
          if (sx < 0 || sy < 0 || sx > size || sy > size) continue;
          g.fillStyle = entity.type === 'player' ? '#ffd166' : '#8ecae6';
          g.beginPath();
          g.arc(sx, sy, 3, 0, Math.PI * 2);
          g.fill();
        }

        // 自己（中心）
        g.fillStyle = '#f2f4f6';
        g.beginPath();
        g.arc(size / 2, size / 2, 3.5, 0, Math.PI * 2);
        g.fill();

        // 朝向
        const yaw = snap?.bot?.yaw ?? 0;
        g.strokeStyle = '#f2f4f6';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(size / 2, size / 2);
        g.lineTo(size / 2 - Math.sin(yaw) * 16, size / 2 - Math.cos(yaw) * 16);
        g.stroke();

        caption.textContent = `中心 (${bx.toFixed(1)}, ${bz.toFixed(1)}) · 视距 ${view} 格 · 方块 ${snap?.blocks?.length ?? 0} · 实体 ${snap?.entities?.length ?? 0}`;
      };

      const handle: ConsoleStreamHandle = ctx.stream({
        message(text) {
          let frame: Frame;
          try {
            frame = JSON.parse(text) as Frame;
          } catch {
            return;
          }
          const next = reduceFrame(state, frame);
          Object.assign(state, next);
          redraw();
        },
        open() {
          state.connected = true;
          redraw();
        },
        close(willRetry) {
          state.connected = false;
          state.note = willRetry ? '接缝断开，正在重连…' : '接缝已关闭';
          redraw();
        },
      });
      ctx.own(handle);

      // 慢轮询兜底：推送少的时候也能看到状态。
      ctx.interval(() => {
        void ctx
          .invoke<Snapshot>('state')
          .then((snap) => {
            state.snapshot = { ...(state.snapshot ?? {}), ...snap };
            state.connected = true;
            state.seq = snap?.seq ?? state.seq;
            redraw();
          })
          .catch((err: unknown) => {
            state.connected = false;
            state.note = `读取快照失败：${err instanceof Error ? err.message : String(err)}`;
            redraw();
          });
      }, 5000);

      redraw();
    },
  },

  /** 接管与动作：申请/释放接管，以及接管期间能做的事。 */
  control: {
    mount(ctx: ConsolePanelContext) {
      const sheet = ctx.ui.sheet({ title: '接管与动作', desc: '接管后这个观战身份由人驱动；释放即回到只读观战。' });
      const holderLine = ctx.ui.msgline('尚未读取持有者状态。');
      const bar = ctx.ui.rowbar();
      const claim = ctx.ui.button('申请接管', {
        variant: 'primary',
        onClick: () => run({ type: 'claim' }),
      });
      const force = ctx.ui.button('强制接管', { onClick: () => run({ type: 'claim', force: true }) });
      const release = ctx.ui.button('释放', { onClick: () => run({ type: 'release' }) });
      bar.append(claim, force, release);
      sheet.body.append(holderLine, bar);

      const log = ctx.ui.log({ max: 200, maxHeight: '220px', empty: '还没有动作。', variant: 'plain' });
      sheet.body.append(log.el);
      ctx.root.append(sheet.el);

      const run = (command: Record<string, unknown>) => {
        log.append(`→ ${JSON.stringify(command)}`, 'dim');
        void ctx
          .invoke('command', [command])
          .then((result) => log.append(`← ${JSON.stringify(result ?? null)}`, 'plain'))
          .catch((err: unknown) => log.append(`✗ ${err instanceof Error ? err.message : String(err)}`, 'bad'));
      };

      const refresh = () => {
        void ctx
          .invoke<{ holder?: string | null }>('state')
          .then((snap) => {
            const holder = snap?.holder ?? null;
            holderLine.textContent = holder ? `当前持有者：${holder}` : '当前无人接管（只读观战）。';
            holderLine.classList.toggle('bad', false);
          })
          .catch((err: unknown) => {
            holderLine.textContent = `读取失败：${err instanceof Error ? err.message : String(err)}`;
            holderLine.classList.add('bad');
          });
      };
      ctx.interval(refresh, 5000);
      refresh();
    },
  },
};

function colorFor(name: string, y: number): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  const light = 34 + Math.max(0, Math.min(18, (y - 60) / 3));
  return `hsl(${hash} 42% ${light}%)`;
}

export default { panels };
