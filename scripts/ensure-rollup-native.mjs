import { chmodSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const scopes = [
  {
    scope: '@rollup',
    packages: ['rollup-linux-x64-gnu', 'rollup-linux-x64-musl'],
  },
  {
    scope: '@esbuild',
    packages: ['linux-x64'],
  },
];

for (const { scope, packages } of scopes) {
  const vendorRoot = path.join(projectRoot, 'vendor', scope);
  const nodeModulesRoot = path.join(projectRoot, 'node_modules', scope);

  for (const packageName of packages) {
    const targetPath = path.join(nodeModulesRoot, packageName);
    if (existsSync(targetPath)) {
      continue;
    }

    const vendorPath = path.join(vendorRoot, packageName);
    if (!existsSync(vendorPath)) {
      console.warn(`[ensure-rollup-native] vendor payload missing for ${scope}/${packageName}`);
      continue;
    }

    console.log(`[ensure-rollup-native] Installing vendored ${scope}/${packageName}`);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    cpSync(vendorPath, targetPath, { recursive: true });
  }
}

const esbuildBinaryTarget = path.join(projectRoot, 'node_modules', 'esbuild', 'bin', 'esbuild');
const esbuildBinaryVendor = path.join(projectRoot, 'vendor', '@esbuild', 'linux-x64', 'bin', 'esbuild');

if (existsSync(esbuildBinaryVendor)) {
  console.log('[ensure-rollup-native] Ensuring esbuild linux binary');
  mkdirSync(path.dirname(esbuildBinaryTarget), { recursive: true });
  cpSync(esbuildBinaryVendor, esbuildBinaryTarget);
  try {
    chmodSync(esbuildBinaryTarget, 0o755);
  } catch (error) {
    console.warn('[ensure-rollup-native] failed to set esbuild binary permissions', error);
  }
} else {
  console.warn('[ensure-rollup-native] vendor payload missing for esbuild linux binary');
}
