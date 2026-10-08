# Viewer fidelity requirements

2026-10-09 有限Create风车适配：锁Create6.0.10原JAR/模型/UV/PNG，风车轴承六朝向、半轴/木顶和本人实际已跟踪转子anchor/轴/真实角度已接入。类型/UUID/entityId/playerUuid/epoch绑定，最多4实体×96方块、24KiB，陈旧>1秒或未支持BE明确不可用，不能凭桥数据造实体。实际普通MawNeko制作启动(-395,64,415)八帆风车，原生1RPM/角度变化；浏览器同账号已见帆转动，服务重启同UUID/新entityId恢复。修复中心LOS误隐藏整个已跟踪转子的服务端显示链，查询可见性保留。53项相关Node在实际v14资产下全过0skip；当前全场景Java对照/YSM未支持模型/复杂移动机仍未验，parity=false。私有素材/回执和截图不入Git，旧服不动。详情renderer-src/NATIVE_DEVICE_RENDERING_COMPATIBILITY.md及服务端风车任务文档。

- The user's My Agent World view must use the exact Minecraft/modpack textures and models. Never substitute vanilla blocks/entities or simplified geometry for missing mod content.
- Keep original namespaces, native state properties, model inheritance, UVs, resource-pack priority, animation metadata and dynamic model inputs. A translated Mineflayer proxy registry is not a rendering registry.
- Read rendering data from the action player's own connection. Do not create another account and call its inventory or UI the original player's state.
- Distinguish source-asset integrity, native network-state integrity and actual scene parity. Exporting resources or passing protocol tests is not proof of rendering parity.
- Prefer browser rendering with Three.js. Port the original mod's geometry, textures, animation rules, materials and live state rather than assuming a Java renderer requires Java client streaming. Use a matched modded Java client as the reference. Consider another rendering backend only after demonstrating a concrete fidelity limitation; never replace browser development with an untested assertion that animation is impossible.
- Missing support is an explicit unavailable/error state. Do not quietly fall back to an approximate view. The native asset verifier's strict rendering check must remain closed until actual complete scene parity is accepted.
- Generated assets, client/mod JARs, world saves and private runtime captures stay outside Git. Keep the existing family server and its network ports untouched while developing in the isolated 1.21.1 lab.
