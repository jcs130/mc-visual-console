# 可独立安装的客户端模组

Minecraft Java 1.21.1；Fabric 和 NeoForge 各构建自己的 JAR。

| 模组 | Fabric | NeoForge | 职责 |
| --- | --- | --- | --- |
| [Content Stream](../tools/native-client-content/README.md) 0.2.0 | 独立安装 | 独立安装 | 用 WebSocket 显示自定义文字、状态、近期事件、进度／概率信息卡 |
| [Background Window](../tools/native-client-window/README.md) 0.1.0 | 独立安装 | 独立安装 | 显式启用后台渲染、自由鼠标、无焦点抢占及实际渲染分辨率 |
| [Native Director](../tools/native-client-director/README.md) | 现有 Fabric 版本 | [NeoForge 0.1.26](../tools/native-client-neoforge/README.md) | 选定角色、实际相机绑定、有限运镜、转场、观战 HUD 与协议适配 |

前两项是客户端 MIT 模组，不依赖 Cortico、N.E.K.O.、Agent MC 核心、导播或服务器插件，
也不依赖对方。可以只装其中一个，也可组合。窗口模组不连接任何网络服务；信息卡模组
仅在显式配置且进入实际世界后连接指定数据流，不扫描端口或自动寻找服务。

信息卡的内容与含义由外部数据源提供。通用服务端接口是公开的
`mc-visual-console/client-content`，Agent 状态投影是 `mc-visual-console/agent-content`。
宿主可以挂在已有 HTTP/WebSocket 服务上；无需读写临时文件或让游戏服务器代转。
人物、模型、个人记忆与任务完成判定仍由宿主管理。消息中的“已受理”只表示受理，
不会变成“目标已完成”。模组只画有界内容，不执行输入、任意脚本、网页或游戏命令。

**升级旧 NeoForge 观战时：**0.1.25 曾内置窗口策略。若要安装独立窗口包，先把观战
导播升级到 0.1.26；新导播已移出窗口运行时与钩子。旧 JVM 配置格式和诊断文件名保留。
0.1.25 与独立窗口包的冲突由元数据明确拒绝，不允许两个窗口实现抢同一个控制点。

源码与构建通过、隔离客户端实际加载、现役安装和实际游戏表现分别记录。当前独立包
已完成双加载器构建、成品消费检查、真实本机 WebSocket 生命周期测试和无核心的离线
客户端加载；该记录不表示现役已替换，也不表示全部模组 GUI、最小化窗口和游戏画面
均已验收。独立 JAR、摘要与私有截图留在交付目录，不提交二进制到源码仓库。
