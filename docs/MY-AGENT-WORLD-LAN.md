# My Agent World 网页的局域网访问

2026-10-06 用户要求先开放家庭 LAN。`prepareNativeWorldPreviewHost` 新增可选 `lanAddress`；未设置时仍监听 `127.0.0.1`。常驻 worker 通过 `MAW_VIEWER_LAN_ADDRESS=192.168.3.163` 显式启用，预期网页地址为 `http://192.168.3.163:28984/`。

LAN 模式监听 IPv4 `0.0.0.0`，请求仍须来自回环或所选私有地址所在 `/24`，Host 必须为对应 LAN IP、本机回环或 localhost 的实际端口；存在 Origin 时也须精确匹配这三个 HTTP 来源。其他接口、公网、任意 Host/Origin 以及写请求继续拒绝。Windows 防火墙同时限制来源，管理入口不随网页开放。

此变更只影响 HTTP 网络访问，原资产、原生渲染、本人连接的数据归属不变。网页继续观察 MawExplorer；它不是新接入 Agent 的画面，新账号需要自己的原生观察链。

定向访问策略与宿主测试共 34 项通过，零失败、零跳过；没有把该结果当成完整画面一致性验收。服务端对应变更和可维护防火墙脚本位于 `jcs130/minecraft-ai-friend` 的 `experiment/agent-society-1.21.1` 分支、`docs/MY-AGENT-WORLD-LAN.md`。

当前部署未切换：Windows UAC 启动返回取消，所属防火墙规则尚不存在，运行进程继续回环。该预期 LAN 地址要在服务端冷备、重启、实际监听与登录验收完成后才能使用。
