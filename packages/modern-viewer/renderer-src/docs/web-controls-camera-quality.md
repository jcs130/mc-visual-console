# 网页操控 高级运镜与画质接入

这组能力面向 Java 1.20.6 的现代 Socket.IO 画面。更新浏览器资源即可使用运镜和画质设置；网页操控需要宿主明确接入授权、暂停 Agent 和恢复 Agent 三个回调。所有操作使用宿主原有的行动角色连接。

当前交付包括六种相机方式、两种展示镜头、可选画质与人物纹理采样，以及键鼠、触摸和标准手柄的控制输入。它是网页游玩的控制基础；完整合成、容器物品移动、交易操作、账号网站和移动应用安装包仍需接入。原生 1.21.1 SSE 场景继续使用自己的相机和只读协议，本轮没有自动迁移到该场景。

## 页面使用

第三人称 `/third/` 的工具栏新增「高级运镜」：

| 模式 | 效果 |
| --- | --- |
| 手动环绕 | 保留拖拽、缩放和平移 |
| 稳定跟随 | 跟随角色移动方向，站立扫描不会带动镜头甩动 |
| 过肩跟随 | 稍向角色侧面偏移 |
| 正面跟随 | 从角色前方跟随 |
| 自动环绕 | 持续绕角色旋转 |
| 高位俯视 | 抬高观察角度，继续跟随角色 |

可调距离、高度、平滑时间、转向速度、环绕速度、垂直 FOV 和避障。另有「环绕展示一周」及「拉远展示」按钮。模型构图使用实际 YSM 绑定尺寸；遇墙立即缩近，离墙平滑恢复。未收到的区块按边界处理。切换跟随对象或传送时直接定位新对象。

拖拽、滚轮或手动控制镜头会退出自动运镜。设置保存在当前浏览器 `minecraft.viewer.director.v1`；照片页不载入自动运镜，OBS 保留自己的 FOV 校准和透明覆盖。地下城 2.5D 保留其镜头、屋顶切面和遮挡策略。

「画质与光影」提供自动、精细、均衡、省电四档，以及原始、柔和、电影三种风格。YSM 纹理可选择原始采样或平滑采样；平滑会生成 mipmap，增加纹理显存开销，省电自动档使用原始采样。原模型、骨骼、UV、PNG 和动作数据保留。

原有隐藏面剔除与视锥剔除继续生效。新增区段遮挡剔除仅在已确认的第一人称生存／冒险模式、相机所在区段完成加载时启用；模式缺失、旁观、环绕、地下城和 OBS 保留几何，避免误删画面。宿主应发送本人实际 `gameMode`，未知发送 `null`。省电档关闭附加调色与阴影，精细电影档开启模型支持的阴影；这不代表完整 Java 光影包效果。

## 宿主接入操控

模块可以从根包的 `mc-visual-console/viewer-control` 和 `mc-visual-console/mineflayer-control` 导入，也可使用下面的仓库相对路径。以下函数可放在宿主中，传入已有 bot、第一和第三人称 Socket.IO 服务，以及宿主自己的回调。

```js
import { createViewerControlBridge } from './renderer-src/host/viewer-control.mjs';
import {
  createMineflayerControlAdapter, createMineflayerRayNavigation,
} from './renderer-src/host/viewer-mineflayer-control.mjs';

export function attachWebControls({
  bot, ioServers, authorizeBrowser, pauseAgent, resumeAgent, pathfinderModule,
}) {
  const navigate = pathfinderModule ? createMineflayerRayNavigation(bot, {
    GoalNear: pathfinderModule.goals.GoalNear,
    createMovements: actor => new pathfinderModule.Movements(actor),
  }) : undefined;
  const bridge = createViewerControlBridge({
    adapter: createMineflayerControlAdapter(bot, { navigate }),
    authorize: authorizeBrowser,
    acquire: pauseAgent,
    release: resumeAgent,
  });
  const connected = socket => {
    const query = socket.handshake.query;
    if (query.overlay === '1' || query.photo === '1'
        || socket.handshake.headers['x-mc-viewer-capture'] === '1') return;
    bridge.subscribeSocket(socket);
  };
  for (const io of ioServers) io.on('connection', connected);
  return async () => {
    for (const io of ioServers) io.off('connection', connected);
    await bridge.dispose();
  };
}
```

三个回调的约定：

- `authorizeBrowser(socket, actor)` 根据宿主已认证的会话判断是否允许控制此 UUID，只有返回 `true` 才通过。不能仅凭用户填写的角色名授权；注销或权限撤销时断开对应 socket。
- `pauseAgent({actor, socket, signal})` 在 Agent 暂停且此前动作已完成或安全终止后才返回。它需要响应取消；如果抛错，宿主负责恢复自己已修改的 Agent 状态。只改一个 UI 的「暂停」标签不满足要求。
- `resumeAgent({actor, reason})` 恢复宿主的调度权。不要自动重放原先结果未知的消耗性动作。桥会先停止按键并取消寻路，等待尚未结束的原生动作，再调用此函数。

可选的点地寻路需要宿主已加载 `mineflayer-pathfinder`。助手复用它的 `goto` 和实际世界射线查询，独立创建移动配置，禁用挖掘、搭桥、搭柱和跑酷；结束后恢复 Agent 原有配置。点击地面顶面，目标最长 48 格，默认 30 秒截止。只有实际位置满足目标条件才返回到达；宿主也可以提供自己的 `navigate(ray,{signal,bot})`。

参考宿主 `packages/modern-viewer/src/mc-modern-viewer.mts` 已增加可选 `createControlBridge(bot)` 钩子；未设置时保持原有行为。其他宿主使用上面的共享模块，保留自己的网络、登录和任务调度方式。无需新增 Minecraft 账号或公网端口。

## 控制方式

只有收到宿主接管成功状态后，页面才开始发送输入。

| 输入设备 | 操作 |
| --- | --- |
| 键盘 | WASD 移动，空格跳跃，Shift 疾跑，Ctrl 潜行，1 至 9 选择快捷栏，Y 交还 Agent |
| 第一人称鼠标 | 单击锁定视角；左键攻击／按住挖掘，右键使用／放置；Esc 解锁并停止 |
| 第三人称 | 拖拽转镜头，点击地面寻路；WASD 相对镜头移动 |
| 触摸 | 左侧摇杆移动，第一人称画面拖动视线；跳跃、疾跑、停止、攻击／挖掘、使用／放置按钮 |
| 标准手柄 | 左摇杆移动，右摇杆转视角，A 跳跃，B 潜行，按左摇杆疾跑，RT 攻击／挖掘，LT 使用／放置，LB／RB 切快捷栏，X 停止，Y 交还 |

一次按下攻击键执行一次攻击或挖掘，不会自动连续选择下一目标。松开停止挖掘或使用物品。文字输入框内的按键不会驱动角色。触屏与真实手柄硬件仍需要消费端实机验收。

页面失焦、隐藏、断线、角色身份变化或心跳超时都会交还控制。移动输入超过 700 毫秒未刷新会停止；接管租期默认 4 秒，每秒心跳一次。接管等待超过 8 秒可取消；晚到的授权消息会被释放。重新连接只恢复观察，须再次点击接管。

每个行动连接只能有一个控制租期。动作串行执行；重复序号、旧租期和并发动作均拒绝，结果未知不会自动重放。`applied` 仅表示输入已应用，`sent` 表示指令已发出；库存仍以原有 `avatarState`、容器和服务器槽位为准。

## 组件选择与扩展

本轮锁定 [camera-controls 3.1.2](https://github.com/yomotsu/camera-controls/releases/tag/v3.1.2)，MIT，配合仓库现有 Three.js 0.184.0 与 minecraft-renderer 0.1.96。相机平滑使用其无 DOM 求解器，碰撞继续读取原渲染器的方块缓存。持续更新不会累积未完成的相机过渡监听器。

| 可选组件 | 适用方向与本轮决定 |
| --- | --- |
| [ecctrl](https://github.com/pmndrs/ecctrl) | 可借鉴第三人称交互；它依赖 R3F／Rapier，本项目保留服务器角色物理 |
| [postprocessing](https://github.com/pmndrs/postprocessing) | 可扩展 AO／泛光等效果；本轮使用现有轻量光照和调色，后续按 GPU 耗时决定是否接入 |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | 适合复杂三角网格拾取；方块相机碰撞沿用体素缓存 |
| [three-vrm](https://github.com/pixiv/three-vrm) | 仓库已有 VRM 通路；扩展动画可考虑原项目的 VRMA 支持，与 YSM 原骨骼通路分开 |
| [nipplejs](https://github.com/yoannmoinet/nipplejs) | 可选触屏摇杆库；本轮复用已有摇杆，减少依赖 |
| [Capacitor](https://capacitorjs.com/docs) | 后续移动应用容器；先验证 HTTPS 网页、触摸、横竖屏和手柄，再封装 Android／iOS |

皮肤和模型继续由已授权宿主向现有实体／appearance 通路发送。浏览器应显示真实选用的模型和贴图；未知动画明确报告未支持。用户上传、资产审核、转换与角色绑定属于服务器和外观后端，不能只改本地画面就声称全服换装成功。

用户研究中提到的 Three.js skills 可参考 [CloudAI-X](https://github.com/CloudAI-X/threejs-skills) 与 [alton47](https://github.com/alton47/threejs-skills)。本轮未安装；使用前应审查内容，并按实际 r184 API 验证。自动画面测试可参考 [Playwright CLI](https://github.com/microsoft/playwright/tree/main/packages/playwright-core/src/tools/skills/playwright-cli)。

完整网页游玩的下一阶段依次是：宿主实机接管验收；复用现有库存确认机制接上容器与交易；模型／皮肤／自定义动画管理界面；PWA 与移动端封装。移动浏览器仍需要现有后端连接 Minecraft TCP，不能把 Node Mineflayer 直接打包当移动端网络栈。

## 验证与更新

在仓库根目录运行：

```powershell
npm ci --prefix packages/modern-viewer/renderer-src
npm run test:web-controls
npm run test:camera-quality
node --test packages/modern-viewer/renderer-src/tools/test/viewer-control-inputs.test.mjs
node --import tsx --test packages/modern-viewer/test/avatar-use-state.test.mjs
node tools/prepare-viewer-assets.mjs java-1.20.6 "<candidate-directory>" --preset=qiandengji
```

通用服省略 `--preset=qiandengji`；需要原音效时准备素材加 `--sounds`。千灯纪已启用特色武器时，还要按[装备外观安装步骤](item-appearances.md#安装)把 `qiandengji-items-1.20.6` 装入新候选目录并再次构建，不能丢掉原有物品外观包。重建前确认原 Minecraft 版本与预设，记录源码提交及 `viewer-client.json` 的 `browserBundleSha256`。消费端同时更新控制桥和实际静态目录，核对 HTTP `/index.js` 返回内容的 SHA-256；只拉源码不会更新已复制的文件。

回滚时先交还网页控制，等待动作和 Agent 交接完成，再恢复上一份宿主配置、控制桥及匹配的整套静态资源。关闭 `createControlBridge`／撤下宿主注册即可禁用新控制入口。运镜和画质可在页面改回手动／原始；无需修改玩家数据或重启 Paper。

自动测试覆盖相机方向／浮动原点／FOV、10,000 帧监听器稳定性、近裁面碰撞、遮挡区段开放恢复、原 YSM 几何保持、输入映射、旧租期拒绝、取消与重连、暂停期间断线和动作完成后交还。真实 Socket.IO 测试使用本地端口和测试角色适配器，不连接 Minecraft、不改玩家物品。

2026 年 10 月 13 日完成 124 项互不重复的相关测试，全部通过、无跳过：主回归 101 项、本人状态及会话 4 项、特色装备／原生界面兼容 19 项。根目录类型检查通过；带千灯纪预设和五件特色装备的 1.20.6 候选构建通过。

本轮没有完成实际 WebGL 画面、帧率提升、真实手柄／手机或线上长时间游玩的验收。Windows 画面工具此前因无法可靠确认浏览器 URL 被自动审批阻止。程序测试与构建结果不能替代这些实机检查；远端宿主部署单独确认。
