# Native spectator integration provenance

The optional NeoForge native display artifact combines this repository's MIT
camera/HUD policies with the spectator integration in this directory. This
artifact is distributed under GPL-3.0-only, with the shared MIT notices retained.
The independent `agent-mc-world` client platform and its SDK stay MIT.

Protocol and native GUI hook references were checked against hpfxd/SpectatorPlus,
tag `v1.2.1+1.21`, commit `ddc5aec185a59bfa8ecb6c12793a3262da6ee0d5`:
https://github.com/hpfxd/SpectatorPlus/tree/ddc5aec185a59bfa8ecb6c12793a3262da6ee0d5
Its upstream license is GPL-3.0, included as LICENSE-SPECTATORPLUS. The original
Fabric mod JAR and its loader are not bundled or loaded here. The native adapter
retains the UUID-bearing packet framing and original compressed item NBT, with
additional connection/world/epoch and read-only controls.

Minecraft, NeoForge, Sodium, TLM and YSM are separate original installations with
their own licenses; this artifact does not distribute their code or model assets.
