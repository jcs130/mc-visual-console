import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { MCVISUAL } from '../src/definition.ts';
import { FakeHost } from './helpers/fake-host.ts';

/** 一个必然连不上的地址，用来测"探不到"这一支。 */
const DEAD = 'http://127.0.0.1:1';

let scratchDir: string;
beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'mcvisual-world-'));
});
afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('Minecraft 画面 World', () => {
  it('干装载不报失败：装载器会接受它', async () => {
    const report = await dryMountWorld(MCVISUAL, { scratchDir });
    expect(report.failures).toEqual([]);
  });

  it('默认配置是禁用的，且观战身份与内建工具不撞名', () => {
    const defaults = MCVISUAL.defaults();
    expect(defaults.enabled).toBe(false);
    const world = MCVISUAL.create(fakeWorldContext(MCVISUAL, { scratchDir }));
    expect(world.id).toBe('mcvisual');
    expect(world.tools().map((t) => t.name)).toEqual(['mcvisual_scene']);
  });

  it('挂载时投一条事实事件；探不到时也照实说，origin 是 internal', async () => {
    const ctx = fakeWorldContext(MCVISUAL, { scratchDir });
    const world = MCVISUAL.create(ctx);
    ctx.persist({ protocolBase: DEAD, probeTimeoutMs: 300 });

    const host = new FakeHost();
    await world.start(host);

    expect(host.events.map((e) => e.type)).toEqual(['mcvisual.unreachable']);
    expect(host.events[0].origin).toBe('internal');
    expect(host.events[0].text).toContain('探不到');
    // 只陈述探测结果，不推断服务器状态
    expect(host.events[0].text).toContain('不推断服务器状态');
    await world.stop();
  });

  it('接缝可达时，mcvisual_scene 报告身份、观看路数、接管者与快照事实', async () => {
    const fetchStub = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ ok: true, bot: 'ag_viewer', viewers: 2, holder: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/state')) {
        return new Response(
          JSON.stringify({
            seq: 41,
            bot: { username: 'ag_viewer', position: [-540.4, 65.02, 872.3] },
            holder: null,
            entities: [{ id: 1 }, { id: 2 }],
            blocks: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchStub);

    const ctx = fakeWorldContext(MCVISUAL, { scratchDir });
    const world = MCVISUAL.create(ctx);
    const tool = world.tools().find((t) => t.name === 'mcvisual_scene')!;
    const receipt = String(await tool.handler({}, {} as ToolCallContext));

    expect(receipt).toContain('画面接缝可达');
    expect(receipt).toContain('ag_viewer');
    expect(receipt).toContain('观看 2 路');
    expect(receipt).toContain('无人接管');
    expect(receipt).toContain('视野内实体 2 个');
  });

  it('allowTakeover=false 时拒掉 claim，但读仍然放行', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    const ctx = fakeWorldContext(MCVISUAL, { scratchDir });
    const world = MCVISUAL.create(ctx);
    ctx.persist({ allowTakeover: false });

    const decl = world.console();
    await expect(decl.invoke!('scene', 'command', [{ type: 'claim' }])).rejects.toThrow('关掉了接管');
    await expect(decl.invoke!('scene', 'health', [])).resolves.toBeTruthy();
  });

  it('控制台声明了面板、独立画面页与只读方法集', () => {
    const ctx = fakeWorldContext(MCVISUAL, { scratchDir });
    const decl = MCVISUAL.create(ctx).console();

    expect(decl.panels?.map((p) => p.id)).toEqual(['scene', 'control']);
    expect(decl.panels?.[0].getMethods).toEqual(['state', 'health']);
    expect(decl.panels?.[1].getMethods).toBeUndefined();
    expect(decl.links?.[0].href).toBe('http://127.0.0.1:7800/dungeon/');
    expect(decl.links?.[0].inheritTheme).toBe(true);
    // 灯不超过 7 个
    expect((decl.lamps ?? []).length).toBeLessThanOrEqual(7);
  });
});
