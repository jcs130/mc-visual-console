# Optional YSM client — Fabric 1.21.1

Import this profile into a **new instance** with Java 21. It installs YSM 2.6.5,
Forge Config API Port, Fabric API, Iris 1.8.8, Sodium 0.6.13 and Complementary
Reimagined r5.2.2 (Medium). It is separate from the Fabric 1.20.6 visual profile:
YSM's official release list has no 1.20.6 build. Do not rename a 1.21.1 JAR or
override its version requirements to install it into a 1.20.6 client.

```powershell
python tools/client-profiles/build-profile.py tools/client-profiles/fabric-1.21.1-ysm D:/output/agent-mc-client-ysm-1.21.1.mrpack
```

Only official download URLs, hashes and generic rendering settings are packaged.
The archive has no credentials, host configuration, control bridge, private
character assets or test mod. See `sources.json` for original project provenance
and licenses. Import settings into a fresh instance rather than overwriting an
existing player's options.

## Model installation

For a local world, put an authorized original model directory under
`config/yes_steve_model/custom/<model-id>/`, retaining its `ysm.json`, textures,
models, animation files and attribution. After entering the world, use YSM's
model reload and selection commands/UI. For multiplayer, the server controls
model distribution and authorization; a local copy does not establish a server
binding. Use the actual server YSM protocol/version to choose the final client
version before joining. This profile is a local visual trial, not that check.

YSM controls the custom model's own animations. Not Enough Animations and EMF/ETF
are not added to this variant before their interaction with the selected YSM
model is checked. Ordinary entities keep the client's original assets. The
1.20.6 visual profile remains independently available.

## Agent and Web integration boundary

The existing Agent MC Java bridge is compiled for Fabric 1.20.6. Do not copy it
into this instance. A 1.21.1 bridge must be implemented and validated separately
before migrating an action player. No production account or goal is migrated by
importing this profile.

An observer can also use a matched YSM client, but its observations must retain
its own identity. The Web renderer still needs original model/animation resources
and the action player's authenticated live state. Installing YSM or Iris here
does not install their Java rendering logic in the browser. See the sibling
1.20.6 profile's architecture notes for the shared core/viewer/host boundaries.

Primary references: [YSM versions](https://modrinth.com/mod/yes-steve-model/versions),
[installation](https://yesstevemodel.github.io/en/wiki/faq/),
[commands](https://yesstevemodel.github.io/en/wiki/command/).
