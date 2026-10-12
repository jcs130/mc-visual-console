# Wandscape native rendering

The optional Wandscape 2.1.3-1211 adapter renders `wandscape:wandscape_npc` from the viewing body's native stream. Source assets and rendering code are integrated; production deployment awaits actual WebGL scene acceptance.

The adapter pins upstream JAR SHA-256 `b9ff4debb039f1fbcac006fd8b53d306e49f8042611b9eb385f292f8c75f0788` and source commit `a93cca08452f16b1100a0328cdc0962aa708c05b`. Original textures, the ModelPart recipe, per-file hashes and MIT license are tracked in `packages/modern-viewer/asset-packs/wandscape-2.1.3-1211`. Generated exports, bundles, JARs, worlds and private captures stay outside Git.

`native-entity-dispatch-wandscape.js` ports the original Humanoid body and WizardHatModel layers, pivots, dilation, rotations and UVs. The 21 original wizard textures select by native metadata field 16; field 17 controls RGB hat tint. Fields 18 and 21 supply casting state and spell ID for the supported upstream casting poses. Identity, movement and animation inputs come from this exact connection. Unsupported equipment, fire or special poses fail explicitly rather than substituting a vanilla model.

The delivered Bedrock model pack is independently compared against Java ModelPart vertices and UVs for its body, untinted hat edge and tinted hat layer. Float32 coordinates use a maximum tolerance of `2e-7`. The hat follows the head bone. Protocol QA confirmed native skin/color updates and movement, including a carrier fix that prevents Geyser's armor-stand head rotation from overwriting RGB.

Run the asset-dependent tests without skips:

```powershell
$env:NATIVE_WANDSCAPE_ASSET_DIR='<actual native export>'
$env:NATIVE_WANDSCAPE_BEDROCK_PACK='<actual maw-wandscape-models.mcpack>'
node --test packages/modern-viewer/renderer-src/tools/test/native-entity-dispatch-wandscape.test.mjs
```

Static geometry checks and authenticated HTTP delivery of actual native chunks, entity packets and original PNGs passed. **Actual browser WebGL, matched Java scene parity and phone appearance remain unverified.** Desktop automatic approval stopped browser inspection because the Windows browser URL could not be determined reliably. Full animation-clock and scene parity flags remain false; these checks must not unlock a production release.
