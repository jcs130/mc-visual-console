import type { WorldDefinition } from 'cortico/world.ts';
import { MCVISUAL_DEFAULTS, type McvisualConfigSection } from './config.ts';
import { McvisualWorld } from './world.ts';

/** `ctx.cfg` 是 `worlds.mcvisual` 的活引用：热改的键现读即生效。 */
export const MCVISUAL: WorldDefinition<McvisualConfigSection> = {
  id: 'mcvisual',
  label: 'Minecraft 画面',
  defaults: () => ({ ...MCVISUAL_DEFAULTS }),
  create: (ctx) => new McvisualWorld({ cfg: ctx.cfg, timezone: ctx.timezone }),
};
