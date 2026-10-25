# Vanilla viewer resources for the actual game version

The web viewer has no protocol-version whitelist. Mineflayer negotiates the game protocol; the picture separately needs matching block states, registry and original textures. An entire missing picture pack is different from a missing optional icon or display font. The latter can stay unavailable without blocking terrain. Do not pass another version's numeric block IDs to the renderer.

For Agent MC World / DSH, read `mc_connection {"action":"viewer-status"}` for the actual version and current viewer root. Install into this root, then call `mc_connection {"action":"viewer-retry"}`. The retry preserves the live Minecraft body, goals and action queue. The console also offers **资源已补全，重试画面**. Normal gameplay does not depend on finishing resource preparation.

Prepare a separate renderer checkout with Node.js 24, Python 3 and Pillow. In a checkout of this repository:

```sh
npm install
npm ci --prefix packages/modern-viewer/renderer-src
python -m venv .viewer-python
# Use .viewer-python/bin/python on Linux/macOS,
# or .viewer-python/Scripts/python.exe on Windows:
<python-executable> -m pip install Pillow==12.3.0
node tools/prepare-vanilla-viewer.mjs --version 1.21.5 --output "<viewer-root-from-viewer-status>" --cache "<separate-private-download-cache>" --python "<python-executable>"
```

`--version` accepts the actual release supported by the installed `minecraft-data`; it is not limited to the versions prebundled with a plugin. For another release replace `1.21.5` with the reported version. The output is `<viewer-root>/versions/<version>`, selected automatically on retry. `--cache` must be separate from the output. This command downloads only official Mojang metadata and the client JAR, checks SHA-1/length against the official manifest, records SHA-256, exports textures/models, builds the browser and validates every available block-state ID. It does not launch Minecraft, modify a server, accept a resource-pack prompt, obtain passwords or call an LLM. Original audio is separate and not prepared by this command.

Keep the original build failure if diagnosing an issue. Repeating preparation verifies the cached JAR; failed staging directories and replaced packs remain available for inspection. A per-version lock prevents duplicate preparation. If the version is absent from the installed registry, update the renderer dependencies deliberately instead of substituting another registry. If Python/Pillow is absent, install it in the separate environment; do not modify the DSH executable or its private credentials. An Agent can carry out these steps using an explicitly chosen DSH filesystem/terminal capability preset; Minecraft-only tools do not grant shell access.

After retry, verify `phase:ready`, `/healthz` and the visible world at the actual version. Successful export is not proof of Java pixel parity or every entity animation. Unavailable icons/fonts remain feature-specific; present files with incorrect hashes still fail verification.
