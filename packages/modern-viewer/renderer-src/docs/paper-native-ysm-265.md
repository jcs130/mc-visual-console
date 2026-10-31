# Paper/Youer 原生 YSM 2.6.5 来源

共享页面与同连接接收器现在识别两组明确来源。旧 Freesia 来源保持 `freesia_worker / 2.4.1 / 2.4.0` 和原 Fabric JAR 摘要；新原生来源为 `ysm_native_backend / 2.6.5 / 2.6.0`，必须匹配原 NeoForge JAR SHA256 `b285c73d4ec010d9a9be3c53c1bee890cf269645be5f1bcf1c27a2e8e82807cb`。不接受只改版本号、未知生产者或混合两个来源的元组。

沿用原 `mcagent:appearance` / `mcagent:ysm_asset` 通道。原 UUID、当前 entityId、epoch、当前连接与时效绑定不变。公开原包仍须通过压缩/解压字节预算、逐文件 SHA256、路径、原始模型/动画/贴图完整性检查。2.6.5 的目录和 ZIP/`.ysm` ID 保留原生注册表身份，中文和相对目录不会被改成别名。

公共 `ysm-bedrock-original` 资源允许明确的2.4.1和2.6.5标记；客户端仍沿用原几何、骨骼、UV、PNG和动画。加密原包由原生客户端解析，网页返回 `YSM_ENCRYPTED_SOURCE_REQUIRED`；不得解密、用旧缓存替换或冒称原包已在网页显示。已有内置原生2.6.5特定模型的严格合同保持独立，完整 Java 像素/动画等价仍未验收。

验证：共享工具全量1,411通过、39既有条件跳过；接收器/资源专项12通过；Paper外观相关21通过、2需外部素材的条件跳过。千灯纪匹配消费方用实际Youer+原NeoForge2.6.5+真实Velocity，通过既有Mineflayer连接传输并解码原公开资源，同时网页导出器核对相同SHA；原加密大肥鱼在原生2.6.5客户端经代理显示，其网页状态明确为不可用。这些不是手机/Xbox画面或完整动画验收。

发布时同时冻结接收器、`src/modern-viewer/ysm-profile.js` 和新浏览器包，并更新消费方原包导出器/来源配置。只提交共享源码不会升级复制的官网、观战后台或客户端。原始模型/JAR、账号、原图和私有测试回执不入Git。
