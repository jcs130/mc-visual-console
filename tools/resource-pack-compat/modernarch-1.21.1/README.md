# Optional ModernArch R304 / Minecraft 1.21.1 sprite compatibility

This small resource pack fixes eight unresolved copper-door sprite identifiers in
the public ModernArch R304 128x pack. It adds atlas aliases from the requested
`minecraft:block/cmodels/*copper_door_*` names to the corresponding original
Minecraft 1.21.1 copper-door resources. Model geometry, UVs, block states and
third-party resource bytes remain unchanged.

The overlay contains only our mapping JSON and metadata. It does not redistribute
ModernArch, Minecraft textures, YSM models or Touhou Little Maid assets. Mapping
source follows this repository's MIT license; original assets retain their licenses.

Use explicitly on Minecraft 1.21.1: zip this directory's `pack.mcmeta` and `assets/`
at the archive root, then place the resulting pack above ModernArch in the resource
pack list. It is not enabled by a viewer or host automatically. Other releases and
loaders are not implicitly accepted.

Reference input: [author's ModernArch page](https://modrinth.com/resourcepack/modernarch),
version ID `35IyPTHL`, `ModernArch R304 [1.20.3-1.21.2] [128x].zip`, SHA256
`b4c262fc3b48bd4e16118a0b1ffa9a5a4bba568253f1148420e3930f136c9462`.

2026-11-02 offline verification: original pack produced 64 baked-model missing-texture
warnings covering these eight identifiers. The overlay reduced that set to zero in
the real Minecraft 1.21.1 / NeoForge 21.1.252 client with the same 14 mod JARs.
The 12 actual transformed-class checks also passed, with no game connection.
This is resource-loading evidence, not acceptance of every scene or mod feature.
