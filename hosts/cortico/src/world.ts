/**
 * Minecraft 画面 World：把一路独立的观战连接（+ 接管通道）接进控制台。
 *
 * 分工照 [接缝协议](../../docs/PROTOCOL.md) 第四节：宿主只做三件事 ——
 * 把 bot 递进来（本 World 不自己连，要求上游的观战接缝已在跑）、转发（stream 转 delta，
 * invoke 收命令）、判活（定时打 /health）。宿主不解析渲染器、不碰协议内部、不塞业务语义。
 *
 * 状态与回执只陈述可确认的事实：探到什么就说什么，探不到就直说探不到。
 */
import { fileURLToPath } from 'node:url';
import type {
  ToolDef,
  World,
  WorldConsoleDecl,
  WorldHost,
  WorldPanelDecl,
  WorldLamp,
  WorldStreamSocket,
} from 'cortico/core/types.ts';
import { nowIso } from 'cortico/core/util.ts';
import { MCVISUAL_CONFIG_GROUP, type McvisualConfigSection } from './config.ts';

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

/** 面板 id 用 [a-z0-9-]，不带 World 前缀。 */
const PANEL_SCENE = 'scene';
const PANEL_CONTROL = 'control';

const PANELS: readonly WorldPanelDecl[] = [
  {
    id: PANEL_SCENE,
    title: '画面',
    description: '这一路观战身份看到的世界；与它自己的感知是同一份。',
    getMethods: ['state', 'health'],
  },
  {
    id: PANEL_CONTROL,
    title: '接管与动作',
    description: '申请/释放接管，以及接管期间的点地移动、转头与四类实体动作。',
  },
];

export interface McvisualWorldOptions {
  /** `worlds.mcvisual` 的活引用。 */
  cfg: McvisualConfigSection;
  timezone: string;
}

/** 一次健康探测的结果，只用于灯与徽标。 */
interface ProbeResult {
  ok: boolean;
  detail: string;
  bot: string | null;
  viewers: number | null;
  holder: string | null;
}

export class McvisualWorld implements World {
  readonly id = 'mcvisual';

  private probe: ProbeResult | null = null;

  constructor(private readonly opts: McvisualWorldOptions) {}

  // -------------------------------------------------------------------------
  // 环境提示词
  // -------------------------------------------------------------------------

  /** 模板不带占位符：环境描述里没有随部署变化的数字。 */
  envPromptVars(): Record<string, string> {
    return {};
  }

  // -------------------------------------------------------------------------
  // 工具（只读一条；动作类工具属于本部署的 Minecraft World）
  // -------------------------------------------------------------------------

  tools(): ToolDef[] {
    return [this.sceneTool()];
  }

  // -------------------------------------------------------------------------
  // 控制台
  // -------------------------------------------------------------------------

  console(): WorldConsoleDecl {
    const cfg = this.opts.cfg;
    return {
      config: [MCVISUAL_CONFIG_GROUP],
      panels: [...PANELS],
      lamps: this.lamps(),
      badges: [
        { label: '门', value: `${cfg.host}:${cfg.port}` },
        { label: '观战身份', value: cfg.username },
        { label: '持有者', value: this.probe?.holder ?? '—', tone: this.probe?.holder ? 'on' : 'plain' },
        { label: '观看', value: this.probe?.viewers ?? '—' },
      ],
      links: [
        {
          label: '开放画面页',
          href: `${trimSlashes(cfg.viewerBase)}/dungeon/`,
          inheritTheme: true,
        },
      ],
      promptDocs: [
        {
          key: 'worlds.mcvisual.envPrompt',
          title: 'Minecraft 画面 · 环境提示词',
          description: '这一路观战连接进 system 前缀的那一段。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
        },
      ],
      invoke: (panel, method, args) => this.invoke(panel, method, args),
      stream: (panel, socket) => this.stream(panel, socket),
    };
  }

  /**
   * 面板的数据面。方法集刻意照接缝协议走，而不是给每个动作起一个名字：
   * 协议加一条命令，这里不用改。
   */
  private async invoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (method === 'health') return this.readHealth();
    if (method === 'state') return this.readJson('/state');

    if (method === 'command') {
      const command = (args[0] ?? {}) as Record<string, unknown>;
      const type = typeof command.type === 'string' ? command.type : '';
      if (!type) throw new Error('命令缺 type');
      if (type === 'claim' && !this.opts.cfg.allowTakeover) {
        throw new Error('本部署关掉了接管（worlds.mcvisual.allowTakeover=false）');
      }
      const body = JSON.stringify(command);
      const res = await this.request('/command', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
      if (!res.ok) throw new Error(`命令 ${type} 被拒：HTTP ${res.status} ${await safeText(res)}`);
      this.probe = null; // 命令之后状态会变，下一次读重新探
      return await safeJson(res);
    }

    throw new Error(`未知方法 ${panel}/${method}`);
  }

  /**
   * 转发：把上游的推送帧原样交给控制台的推送通道。
   * 上游断开时关掉面板的那条连接（客户端会按自己的退避重连）。
   */
  private stream(panel: string, socket: WorldStreamSocket): void {
    const url = toStreamUrl(this.opts.cfg.protocolBase);
    let closed = false;
    let upstream: WebSocket | null = null;

    const shutdown = (reason: string) => {
      if (closed) return;
      closed = true;
      try {
        upstream?.close();
      } catch {
        /* 关闭失败不影响对端 */
      }
      socket.close(reason);
    };

    try {
      upstream = new WebSocket(url);
    } catch (err) {
      socket.close(`无法连接接缝：${describeError(err)}`);
      return;
    }

    upstream.addEventListener('open', () => {
      upstream?.send(JSON.stringify({ type: 'set', viewDistance: 6 }));
    });
    upstream.addEventListener('message', (event: MessageEvent) => {
      if (closed) return;
      const data = typeof event.data === 'string' ? event.data : '';
      if (data) socket.send(data);
    });
    upstream.addEventListener('close', () => shutdown('接缝连接已断开'));
    upstream.addEventListener('error', () => shutdown('接缝连接出错'));

    socket.onMessage((text) => {
      if (!closed && upstream && upstream.readyState === 1) upstream.send(text);
    });
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  /** 挂载时探一次，把结果作为一条内部事件投出去；探不到也照实说。 */
  async start(host: WorldHost): Promise<void> {
    const probe = await this.readHealth().catch((err) => ({
      ok: false,
      detail: describeError(err),
      bot: null,
      viewers: null,
      holder: null,
    }) as ProbeResult);
    this.probe = probe;

    await host.pushEvent({
      type: probe.ok ? 'mcvisual.connected' : 'mcvisual.unreachable',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: probe.ok
        ? `Minecraft 画面接缝已连上：身份 ${probe.bot ?? '未知'}，观看 ${probe.viewers ?? '未知'} 路，${probe.holder ? `当前持有者 ${probe.holder}` : '此刻无人接管'}。`
        : `Minecraft 画面接缝探不到：${probe.detail}。画面与接管此刻不可用；这一条只陈述探测结果，不推断服务器状态。`,
    });
  }

  async stop(): Promise<void> {
    this.probe = null;
  }

  // -------------------------------------------------------------------------
  // 内部
  // -------------------------------------------------------------------------

  private lamps(): WorldLamp[] {
    const cfg = this.opts.cfg;
    const probe = this.probe;
    if (!probe) {
      return [
        { label: '画面接缝', state: 'loading', hint: '尚未探测（挂载后第一次请求会探）。' },
        { label: '接管', state: cfg.allowTakeover ? 'online' : 'offline', hint: cfg.allowTakeover ? '允许操作员接管。' : '本部署关掉了接管。' },
      ];
    }
    return [
      {
        label: '画面接缝',
        state: probe.ok ? 'online' : 'error',
        hint: probe.ok ? `身份 ${probe.bot ?? '未知'}` : probe.detail,
      },
      {
        label: '接管',
        state: cfg.allowTakeover ? (probe.holder ? 'online' : 'loading') : 'offline',
        hint: cfg.allowTakeover ? (probe.holder ? `持有者 ${probe.holder}` : '无人接管，只读观战。') : '本部署关掉了接管。',
      },
    ];
  }

  private async readHealth(): Promise<ProbeResult> {
    const res = await this.request('/health');
    const body = (await safeJson(res)) as Record<string, unknown> | null;
    if (!res.ok || !body || body.ok !== true) {
      return { ok: false, detail: `HTTP ${res.status}`, bot: null, viewers: null, holder: null };
    }
    return {
      ok: true,
      detail: 'ok',
      bot: typeof body.bot === 'string' ? body.bot : null,
      viewers: typeof body.viewers === 'number' ? body.viewers : null,
      holder: typeof body.holder === 'string' ? body.holder : null,
    };
  }

  private async readJson(path: string): Promise<unknown> {
    const res = await this.request(path);
    if (!res.ok) throw new Error(`读取 ${path} 失败：HTTP ${res.status}`);
    return await safeJson(res);
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${trimSlashes(this.opts.cfg.protocolBase)}${path}`;
    return fetch(url, { ...init, signal: AbortSignal.timeout(this.opts.cfg.probeTimeoutMs) });
  }

  /** 一条只读观测：这一路画面现在是什么状态。 */
  private sceneTool(): ToolDef {
    return {
      name: 'mcvisual_scene',
      description:
        '报告这一路 Minecraft 画面（观战接缝）此刻可确认的事实：接缝是否可达、观战身份、观看路数、当前接管持有者，以及快照里的位置与实体数。不推断服务器状态，也不改动世界。',
      tags: ['read'],
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      handler: async () => {
        const probe = await this.readHealth().catch((err) => ({
          ok: false,
          detail: describeError(err),
          bot: null,
          viewers: null,
          holder: null,
        }) as ProbeResult);
        this.probe = probe;

        if (!probe.ok) {
          return `画面接缝此刻探不到（${probe.detail}）。画面与接管不可用；这只说明探不到，不说明服务器怎么了。`;
        }

        let extra = '';
        try {
          const snapshot = (await this.readJson('/state')) as Record<string, unknown> | null;
          const bot = (snapshot?.bot ?? {}) as Record<string, unknown>;
          const pos = Array.isArray(bot.position) ? bot.position : null;
          const entities = Array.isArray(snapshot?.entities) ? snapshot.entities.length : null;
          if (pos) extra = `快照：位置 ${pos.map((n) => Math.round(Number(n) * 10) / 10).join(', ')}；视野内实体 ${entities ?? '未知'} 个。`;
        } catch (err) {
          extra = `快照读取失败：${describeError(err)}。`;
        }

        return [
          `画面接缝可达。观战身份 ${probe.bot ?? '未知'}，观看 ${probe.viewers ?? '未知'} 路。`,
          probe.holder ? `当前持有者：${probe.holder}（由人驱动中）。` : '此刻无人接管，只读观战。',
          extra,
        ]
          .filter(Boolean)
          .join(' ');
      },
    };
  }
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function trimSlashes(value: string): string {
  return value.replace(/\/+$/u, '');
}

/** http(s) → ws(s)，并归一化结尾斜杠。 */
function toStreamUrl(base: string): string {
  const trimmed = trimSlashes(base);
  return trimmed.replace(/^http/iu, 'ws');
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${err.message}（${cause.message}）`;
    return err.message;
  }
  return String(err);
}
