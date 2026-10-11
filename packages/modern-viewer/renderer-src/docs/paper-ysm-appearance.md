# Paper YSM: automatic original model assets

Production Proxy/Worker 0.3.0 routing was deployed on 2026-10-11; the diagnostic 0.3.1 source below remains a candidate. Remote LAN consumers need their own update and rebuild. This profile is Paper1.20.6 + Worker YSM2.4.1/protocol2.4.0; native1.21.1/YSM2.6.5 remains separate.

## Transport and identity

`host/viewer-appearance.mjs` observes actual Worker appearance through the existing action connection. State packets are pinned to the original YSM JAR hash, schema, UUID, epoch and native entity ID. Records reset on login/respawn/end, refresh every5s and expire after15s. ID reuse cannot apply a previous player's model.

With a Web subscriber, `viewer-ysm-assets.mjs` requests the declared public model revision on `mcagent:ysm_asset`. The Proxy serves only assigned public assets on the same backend. No new account or HTTP/public port. Ordinary clients without a subscriber receive no model blobs. Requests are serialized, nonce/hash bound, chunked, timed out and limited to3attempts/revision. Compressed SHA256, decompression limits, per-file SHA/length, paths and pinned profile are checked before any browser emission. Maximum compressed2MiB/raw8MiB/model,32 cached models/32MiB.

The host emits `appearanceAsset` before matching `appearanceState`, plus reset/remove events. `renderAvailable=true` means verified model source is ready; complete native parity stays false. Camera uses this same bridge and requires models/chunks to finish before capture.

## Automatic upload conversion

Server implementation: `minecraft-ai-friend/paper/integrations/freesia-optional/bridge/org/afuhome/appearance/ModelCatalog.java`. The private configured root is the Worker's actual `yes_steve_model/custom` directory, never `auth`. Public spec2/free=true folders or ZIPs become hash-addressed gzip bundles after two stable5s scans. Original model/UV/PNG/animation bytes and hashes are preserved. Changes/deletions invalidate revisions and trigger native `ysm model reload` once per revision, with a30s rate limit. ZIP traversal, links, duplicates and resource budget violations are rejected. Encrypted `.ysm` needs the author's distributable source; it is not decoded.

## Browser renderer

`src/modern-viewer/paper-ysm.js` consumes arbitrary validated model IDs, original Bedrock1.12 geometry/UV and PNGs, through the shared geometry engine. Bone names retain bounded Unicode. Original faces are merged only within identical transforms. Actual entity UUID/ID and state revision guard asynchronous mounts; teardown restores hidden vanilla children. Names remain visible. Numeric original animation tracks and a small explicitly supported Molang subset are sampled; unknown tracks/controllers show an explicit unavailable reason and bind pose. No invented animation, equipment or native Java pixel parity claim.

Real isolated tests photographed builtin geometry, a newly uploaded ZIP and a replaced texture; output PNG and bundle hashes changed with the real replacement. Human camera chat contained exactly start/complete notices, and2×2 delivered four actual maps.16 controlled Mineflayer4.37.1 connections received real gameplay replies and SHA-verified source bundles, without encrypted native YSM cache. These are controlled tests, not autonomous LLM play. Native Java comparison, equipment/all animation and Bedrock custom player model rendering remain unaccepted.

## Updating a consumer

Pull both shared host source and renderer changes. Run `npm run test:appearance`; build the consumer's existing original1.20.6/qiandengji asset directory using `tools/build-minecraft-viewer-client.mjs <renderer-src> <assets-root> --preset=qiandengji`. Restart that consumer's existing host and verify its served bundle hash. Source changes do not update another computer's LAN viewer. Camera prepares a fresh pinned runtime with `paper/ops/prepare-photo-camera.mjs`; never overwrite an accepted runtime.

Official sources: [model types](https://yesstevemodel.github.io/wiki/type/), [original format](https://yesstevemodel.github.io/wiki/struct/), [reload](https://yesstevemodel.github.io/wiki/command/), [Geyser custom entities](https://geysermc.org/wiki/geyser/custom-entities/). The separate deployed Geyser extension projects supported assigned Java/Agent models through player skins; Bedrock self-assignment and full native animation/device parity remain unaccepted.

## 2026-10-11：等待角色模型与服务离线

Paper桥接0.3.1候选保留原schema/原因码，新增`workerConnected`、`stateStatus`和中文`message`。共享观察器保留有界、已校验字段；未确认模型时`renderReason`沿用服务端原因，不能显示为资源仍在下载。旧0.3.0报`YSM_WORKER_STATE_UNAVAILABLE`也可能是未绑定模型的默认外观，单凭该码不能认定Worker故障。控制器已连接也不证明特定角色已经分配模型。

本次正式服务仍0.3.0，不重启；修复源码和编译不代表代理或远端网页已更新。普通皮肤不是YSM模型分配，原模型/贴图/UUID绑定、资源校验和过期规则保持。
