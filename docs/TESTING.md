# Portable checks and optional Cortico integration

Run from this repository's root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

`pnpm test` runs the portable TypeScript core/client tests and every renderer
suite named by the root script, including the native-world, same-player HUD,
assets, fishing and host tests. Bare `pnpm exec vitest` and `pnpm test:watch`
use the same portable TypeScript scope. The Node/renderer suites continue to
run through `pnpm test`; they are not discovered by Vitest.

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
