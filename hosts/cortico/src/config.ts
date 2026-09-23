import type { ConfigGroup } from 'cortico/core/types.ts';

/** config.json 的 worlds.mcvisual 段；默认禁用，由 bot 或部署启用。 */
export interface McvisualConfigSection {
  enabled: boolean;
  /** 画面 origin（萌悦/千灯纪现代画面那套页面）。 */
  viewerBase: string;
  /** 接缝协议 origin（HTTP /state /health + POST /command 与推送 WS）。 */
  protocolBase: string;
  /** Minecraft 服务器地址（走统一外门，见 mc-visual-console 的规约）。 */
  host: string;
  /** 统一外门端口；真人 NeoForge 口不在本 World 的范围内。 */
  port: number;
  /** 观战身份。一个身份只能有一条会话，必须与别的 bot 区分开。 */
  username: string;
  /** 协议版本，须与门的版本一致。 */
  version: string;
  /** 允许操作员接管（接管即由人驱动这个观战身份）。 */
  allowTakeover: boolean;
  /** 健康探测超时，毫秒。 */
  probeTimeoutMs: number;
}

export const MCVISUAL_DEFAULTS: McvisualConfigSection = {
  enabled: false,
  viewerBase: 'http://127.0.0.1:7800',
  protocolBase: 'http://127.0.0.1:7801',
  host: '127.0.0.1',
  port: 25702,
  username: 'ag_viewer',
  version: '1.21.1',
  allowTakeover: true,
  probeTimeoutMs: 1500,
};

/** World 配置的 JSON Schema 声明。每个路径都必须落在 worlds.mcvisual. 段内。 */
export const MCVISUAL_CONFIG_GROUP: ConfigGroup = {
  id: 'world:mcvisual',
  owner: 'world:mcvisual',
  schema: {
    type: 'object',
    title: 'Minecraft 画面',
    properties: {
      'worlds.mcvisual.viewerBase': {
        type: 'string',
        title: '画面地址',
        description: '现代画面的 origin，独立画面页从这里开。',
      },
      'worlds.mcvisual.protocolBase': {
        type: 'string',
        title: '接缝地址',
        description: '观战接缝的 origin：/health /state 读状态，POST /command 下命令。',
      },
      'worlds.mcvisual.host': {
        type: 'string',
        title: '服务器地址',
        description: '走统一外门；不要填真人 NeoForge 口。',
        'x-hot': true,
      },
      'worlds.mcvisual.port': {
        type: 'number',
        title: '端口',
        description: '统一外门端口。',
        'x-hot': true,
      },
      'worlds.mcvisual.username': {
        type: 'string',
        title: '观战身份',
        description: '本 World 连接时用的游戏名。一个身份只能有一条会话。',
        'x-hot': true,
      },
      'worlds.mcvisual.version': {
        type: 'string',
        title: '协议版本',
        description: '须与门的版本一致，否则进不去或读到错乱世界。',
        'x-hot': true,
      },
      'worlds.mcvisual.allowTakeover': {
        type: 'boolean',
        title: '允许接管',
        description: '关掉之后面板只签发观战请求，不能由人驱动这个身份。',
        'x-hot': true,
      },
      'worlds.mcvisual.probeTimeoutMs': {
        type: 'number',
        title: '探测超时',
        description: '健康探测的毫秒超时。',
      },
    },
  },
};
