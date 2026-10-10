# Source checks, original assets and optional Cortico integration

Run from this repository's root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm exec vitest run
```

These commands run the portable TypeScript core/client checks. `pnpm test`
also runs every renderer suite named by the root script, including native-world,
same-player HUD, fishing, host and original asset tests. Vitest does not discover
the Node/renderer suites.

The full renderer check uses the committed original 1.21.1 source pack,
including the Mojang Chinese language asset and original YSM models. No external
checkout or LAN file server is needed:

```sh
pnpm assets:verify
pnpm test
```

To check a different matching original export, explicitly override the two paths:

```powershell
$env:NATIVE_GUIDE_ASSET_DIR = 'C:\path\to\verified-native-export'
$env:NATIVE_YSM_ASSET_DIR = $env:NATIVE_GUIDE_ASSET_DIR
pnpm test
```

Each directory contains `native-assets.json` and its original, hash-checked
resources. The source-bound suites fail when these inputs are missing; do not
substitute generated fixtures or interpret a missing-resource error as a renderer
regression. Other optional deployment checks report their own skipped cases.
Record pass/fail/skip counts and the asset manifest hash with the result. Passing
these checks does not establish complete scene parity. Shared original resources
are versioned in `asset-packs/`; private runtime captures stay outside Git.
Tests read local resources and do not download them. Missing committed resources
fail just like a missing external export.

Java 1.20.6 bubbles have a focused suite, also included in `pnpm test`:

```sh
npm ci --prefix packages/modern-viewer/renderer-src
npm run test:text-displays
```

It uses real protocol serialization and the committed original Unihex source.
The resource-lifecycle test uses a synthetic canvas surface; actual pixels and
player/NPC audiences require the isolated browser/game checks in the
[bubble guide](../packages/modern-viewer/renderer-src/docs/text-display-bubbles.md).

The root workspace includes only the root package. `hosts/cortico` is an
optional host with a separate manifest, declared Cortico dependency and six
integration tests. Its tests import the real SDK's dry-mount implementation,
world contract and core utilities. They are not replaced with mocks or silently
skipped when the SDK is missing.

Run the optional checks explicitly:

```sh
pnpm test:cortico
```

This command uses `vitest.cortico.config.ts` and requires either the real SDK
installed for `hosts/cortico`, with its source API exports available, or an
explicit Cortico source checkout. To use a checkout without changing either
project's dependency installation:

```sh
CORTICO_SOURCE_DIR=/absolute/path/to/Cortico pnpm test:cortico
```

PowerShell:

```powershell
$env:CORTICO_SOURCE_DIR = 'C:\path\to\Cortico'
pnpm test:cortico
Remove-Item Env:CORTICO_SOURCE_DIR
```

The checkout must contain a `package.json` named `cortico`, and
`src/extensions/dry-mount.ts`, `src/core/types.ts`, `src/core/util.ts` and
`src/world.ts`. Its own dependencies must already be available. The configuration
does not install packages, start Cortico, connect a Minecraft player, or infer
an external checkout location. Missing or incompatible SDK source fails with a
`CORTICO_TEST_SOURCE_*` error. Passing portable tests does not assert Cortico
compatibility; record the optional result and SDK version separately.
