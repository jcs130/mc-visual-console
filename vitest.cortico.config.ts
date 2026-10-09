import { defineConfig } from 'vitest/config';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('.', import.meta.url));
const sdkImports = ['extensions/dry-mount.ts', 'core/types.ts', 'core/util.ts', 'world.ts'];
const sourceDirectory = process.env.CORTICO_SOURCE_DIR;

// Use a real SDK, never an in-repository mock or a machine-specific checkout.
// Validate before test discovery so missing source is a clear failure, not six
// silently skipped compatibility tests.
function corticoAliases() {
  if (sourceDirectory !== undefined) {
    if (!sourceDirectory.trim()) throw new Error('CORTICO_TEST_SOURCE_INVALID: CORTICO_SOURCE_DIR must name a Cortico checkout.');
    let checkout: string;
    try {
      checkout = realpathSync(resolve(sourceDirectory));
      if (JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8')).name !== 'cortico') throw new Error('wrong package');
    } catch {
      throw new Error('CORTICO_TEST_SOURCE_INVALID: CORTICO_SOURCE_DIR must contain Cortico package.json and src/.');
    }
    const source = join(checkout, 'src');
    if (sdkImports.some(entry => !existsSync(join(source, entry)))) {
      throw new Error('CORTICO_TEST_SOURCE_INCOMPATIBLE: required src/extensions/dry-mount.ts, src/core/{types,util}.ts and src/world.ts are missing.');
    }
    return [{ find: /^cortico\//, replacement: source.replaceAll('\\', '/') + '/' }];
  }
  try {
    // hosts/cortico is deliberately outside the portable pnpm workspace. It
    // can install its own declared SDK dependency independently.
    const requireSdk = createRequire(new URL('./hosts/cortico/package.json', import.meta.url));
    return sdkImports.map(entry => ({ find: 'cortico/' + entry, replacement: requireSdk.resolve('cortico/' + entry) }));
  } catch {
    throw new Error('CORTICO_TEST_SOURCE_REQUIRED: install the real Cortico SDK for hosts/cortico, or set CORTICO_SOURCE_DIR to a compatible Cortico source checkout. Portable checks: pnpm test. See docs/TESTING.md.');
  }
}

export default defineConfig({
  root: repository,
  resolve: { alias: corticoAliases() },
  test: {
    include: ['hosts/cortico/tests/**/*.test.ts'],
    passWithNoTests: false,
  },
});
