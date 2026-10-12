# Paper YSM: automatic original model assets

Production uses AgentAppearance0.3.1 as of 2026-10-12. The animation/held-item bundle extension0.3.2 and renderer changes below are a tested candidate, not a production or remote LAN deployment. This profile is Paper1.20.6 + Worker YSM2.4.1/protocol2.4.0; native1.21.1/YSM2.6.5 remains separate.

## Transport and identity

`host/viewer-appearance.mjs` observes actual Worker appearance through the existing action connection. State packets are pinned to the original YSM JAR hash, schema, UUID, epoch and native entity ID. Records reset on login/respawn/end, refresh every5s and expire after15s. ID reuse cannot apply a previous player's model.

With a Web subscriber, `viewer-ysm-assets.mjs` requests the declared public model revision on `mcagent:ysm_asset`. The Proxy serves only assigned public assets on the same backend. No new account or HTTP/public port. Ordinary clients without a subscriber receive no model blobs. Requests are serialized, nonce/hash bound, chunked, timed out and limited to3attempts/revision. Compressed SHA256, decompression limits, per-file SHA/length, paths and pinned profile are checked before any browser emission. Maximum compressed2MiB/raw8MiB/model,32 cached models/32MiB.

The host emits `appearanceAsset` before matching `appearanceState`, plus reset/remove events. `viewer-ysm-motion.mjs` additionally emits `appearanceMotion`: actual equipment, metadata flags, ground packets, relative head look, measured horizontal motion and native swing/hurt events from this same connection. Own swings are observed on the existing protocol serializer, without replacing gameplay methods or parsing outgoing chat/authentication. Events are UUID/entity/epoch/sequence bound, limited to ten updates/second with a static heartbeat, and released on teardown. `renderAvailable=true` means verified model source is ready; complete native parity stays false.

## Automatic upload conversion

Server implementation: `minecraft-ai-friend/paper/integrations/freesia-optional/bridge/org/afuhome/appearance/ModelCatalog.java`. The private configured root is the Worker's actual `yes_steve_model/custom` directory, never `auth`. Public spec2/free=true folders or ZIPs become hash-addressed gzip bundles after two stable5s scans. Original model/UV/PNG/animation bytes and hashes are preserved. Changes/deletions invalidate revisions and trigger native `ysm model reload` once per revision, with a30s rate limit. ZIP traversal, links, duplicates and resource budget violations are rejected. Encrypted `.ysm` needs the author's distributable source; it is not decoded.

## Browser renderer

`src/modern-viewer/paper-ysm.js` consumes arbitrary validated model IDs, original Bedrock1.12 geometry/UV and PNGs, through the shared geometry engine. Bone names retain bounded Unicode. Original faces are merged only within identical transforms. Actual entity UUID/ID and state revision guard asynchronous mounts; teardown restores hidden vanilla children and name positions. Names stay visible above the model rather than overlapping tall ears. The omitted YSM2.4.1 scale is correctly .7; authored width/height scales remain authoritative.

`paper-ysm-animation.js` layers original locomotion, lower-priority pre-parallel, arm hold/use/swing, hurt, extra and additive parallel rotation tracks. It samples original numeric/Molang vectors, pre/post discontinuities, linear/Catmull-Rom interpolation and one-shot timeline commands. The bounded interpreter never executes JavaScript or host functions. Action tokens preserve phase and combo variables; terminal timelines still run when a frame skips the final keyframe. An unsupported optional layer reports its reason without freezing valid base motion. Unknown native queries, custom controllers and advanced physical expressions remain unsupported; `completeEntityParityVerified=false`.

`paper-ysm-items.js` mounts actual main/offhand items on each original `RightHandLocator`/`LeftHandLocator` (including locators2–8). It uses the locked YSM2.4.1 item-layer transform, original Java1.20.6 item/block models, inherited display transforms, original PNGs and generated sprite edge extrusion. Faces are batched by texture. Native item swaps, empty hands, left-handed players, late async loads and disconnects release previous meshes. Dynamic custom-head/model, tint/potion visuals, special builtin renderers and full item-effect parity remain unsupported and produce a visible diagnostic; do not call these complete equipment parity.

Earlier isolated tests photographed builtin geometry, a newly uploaded ZIP and a replaced texture; output PNG and bundle hashes changed with the real replacement. Human camera chat contained exactly start/complete notices, and2×2 delivered four actual maps.16 controlled Mineflayer4.37.1 connections received real gameplay replies and SHA-verified source bundles, without encrypted native YSM cache. The 2026-10-12 candidate additionally passes23 appearance/action tests,41 separate native regression tests with verified native assets and8 byte-for-byte source animation bundle checks. Real Mineflayer4.39 through the isolated candidate Proxy/Worker rendered Cormy/NEKO in the actual photo-mode browser: walking, sword attack, both hands, stone swap, stopping, own swing, nametag clearance and entity removal; original captures/video stay outside Git. These are controlled tests, not autonomous LLM play or native Java/device pixel parity.

## Updating a consumer

Pull both shared host source and renderer changes, including the new `host/viewer-ysm-motion.mjs`. Run `npm run test:appearance`; build the consumer's existing original1.20.6/qiandengji asset directory using `tools/build-minecraft-viewer-client.mjs <renderer-src> <assets-root> --preset=qiandengji`. Restart that consumer's existing host and verify its served bundle hash. Source changes do not update another computer's LAN viewer. Server-side AgentAppearance0.3.2 is required for the previously omitted arm/extra source animations; a renderer-only update cannot recover files never sent. Camera prepares a fresh pinned runtime with `paper/ops/prepare-photo-camera.mjs`; never overwrite an accepted runtime.

Known-model size calibration is an explicit source-definition change, not automatic normalization of every upload: the candidate Cormy scale is .82 and NEKO1.0 (uniform XYZ), giving approximately2.22/2.20 blocks including ears. No collision box, gameplay coordinates or original geometry/UV/PNG is changed. Production source definitions and remote viewers are unchanged until their deployment is approved.

Official sources: [model types](https://yesstevemodel.github.io/wiki/type/), [original format](https://yesstevemodel.github.io/wiki/struct/), [reload](https://yesstevemodel.github.io/wiki/command/), [Geyser custom entities](https://geysermc.org/wiki/geyser/custom-entities/). The separate deployed Geyser extension projects supported assigned Java/Agent models through player skins; Bedrock self-assignment and full native animation/device parity remain unaccepted.

## 2026-10-11：等待角色模型与服务离线

Paper桥接0.3.1候选保留原schema/原因码，新增`workerConnected`、`stateStatus`和中文`message`。共享观察器保留有界、已校验字段；未确认模型时`renderReason`沿用服务端原因，不能显示为资源仍在下载。旧0.3.0报`YSM_WORKER_STATE_UNAVAILABLE`也可能是未绑定模型的默认外观，单凭该码不能认定Worker故障。控制器已连接也不证明特定角色已经分配模型。

本次正式服务仍0.3.0，不重启；修复源码和编译不代表代理或远端网页已更新。普通皮肤不是YSM模型分配，原模型/贴图/UUID绑定、资源校验和过期规则保持。
