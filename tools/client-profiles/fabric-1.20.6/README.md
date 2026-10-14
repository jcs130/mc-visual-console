# Optional Java client visuals — Fabric 1.20.6

For YSM, see the separate [Fabric 1.21.1 YSM profile](../fabric-1.21.1-ysm/README.md).
It is a different client version and does not upgrade an active 1.20.6 Agent.

This profile is shared by action and observer clients. Import the generated
`.mrpack` into a **new instance**, using a Java 21 runtime. It contains visual
dependencies and settings, with no account, server, login mod, control bridge,
world save, personality or memory. Those remain the consuming project's concern.
Do not extract its `options.txt` over an existing user's configuration.

Build without downloading or modifying any game installation:

```powershell
python tools/client-profiles/build-profile.py tools/client-profiles/fabric-1.20.6 D:/output/agent-mc-client-visuals-1.20.6.mrpack
```

The archive contains official download URLs and hashes, not redistributed mod
JARs or resource ZIPs. The launcher verifies the downloads during import. Original
project names, authors' assets and pack order are preserved. `sources.json`
records versions, authors, licenses and upstream pages. Each project retains its
own license; the repository's code license does not relicense those downloads.

## Version lock and intended effects

| Component | Pinned version | Role |
|---|---|---|
| Minecraft / Fabric Loader | 1.20.6 / 0.19.5 | Client runtime |
| Fabric API | 0.100.8+1.20.6 | Mod dependency |
| Iris / Sodium | 1.7.2 / 0.5.11 for 1.20.6 | Shader loading / rendering |
| Complementary Reimagined | r5.2.2, Medium preset | Lighting, shadows, water |
| Faithful 32x | 1.20.6, June 2026 | Optional authored 32x textures |
| Not Enough Animations | 1.12.6 for 1.20.6 | Third-person item/use animations |
| EMF / ETF | 3.0.17 / 7.0.13 for 1.20.6 | Entity model/texture support |
| Fresh Animations | 1.10.4 | Resource-driven mob animation |

Resource priority is Fabric → Faithful → Fresh Animations. This is an opt-in
appearance change, not a claim of vanilla texture parity. A consuming pack's
additional resources must be checked for priority conflicts before activation.

Complementary r5.9.3 was tried but rejected for this lock: Iris 1.7.2 reported
unresolved newer biome and End-flash uniforms. r5.2.2 removes those errors in the
local Overworld trial. This does not certify every dimension or GPU. YSM does not
list a 1.20.6 release; this profile does not substitute a generic player for a
project's custom character model. Mod loading alone is not animation acceptance.

## Architecture and Web reuse

1. **Java client:** visual mods, shader execution and original resource loading.
   An observer may use the same visual profile with its own explicitly configured
   view identity. Its inventory is never the action player's inventory.
2. **Agent MC World:** owns the action client's bridge, source/session identity,
   incremental world/entity/UI state and action receipts. It should expose these
   data through a host-independent contract. It does not own a broadcaster's
   personality or provider credentials.
3. **mc-visual-console:** owns browser rendering, camera controls, original asset
   import, supported animation/material implementations and fidelity diagnostics.
   Forwarding positions does not transfer an Iris shader or a Java mod renderer.
   Each supported effect needs an explicit browser implementation/export contract.
4. **Host adapters:** supply configuration, authentication and lifecycle wiring.
   Cortico, N.E.K.O and other hosts should reuse the same core and viewer contracts.

The existing native-frame page is an optional reference view. This profile does
not replace the Web renderer with a video stream and does not implement the
Java-to-Web world-state bridge. Unsupported mod geometry or animations remain
explicitly unsupported until validated against the native client.

## Rollout

Validate first in a separate local world. Check actual pixels, use/walk poses,
frame intervals, resource conflicts and shader logs. Before adding this profile
to an active action client, preserve its controls, server/login configuration,
account, bridge, memory and goals; follow the consuming project's restart policy.
Do not run two action clients with the same account. A profile build does not
start Minecraft, connect to a server, restart an Agent or publish a package.
