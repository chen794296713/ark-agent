import { mkdir, writeFile, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { compileAgentPackage, verifyCompiledPackage } from '../lib/agent-packages/compiler';
import { packageIdSchema, packageOverlaySchema } from '../lib/agent-packages/validation';
/** Export into a NEW directory only. Atomic rename; no existing profile replacement. */
export async function exportAgentPackage(packageId: string, harness: string, destination: string) {
  const id = packageIdSchema.parse(packageId);
  const bundle = compileAgentPackage(id, packageOverlaySchema.parse({ name: id, harness }));
  if (!verifyCompiledPackage(bundle)) throw new Error('Package verification failed');
  const target = resolve(destination);
  const stage = `${target}.stage-${randomUUID()}`;
  await mkdir(dirname(target), { recursive: true });
  // An existing target is always an error, including empty directories and symlinks.
  const { lstat } = await import('node:fs/promises');
  try { await lstat(target); throw new Error('Destination already exists; choose a new isolated directory'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(stage, { mode: 0o700 });
  try {
    for (const file of bundle.files) {
      if (!/^[a-zA-Z0-9_.\/-]+$/.test(file.path) || file.path.split('/').some((segment) => segment === '..' || !segment) || file.path.startsWith('/')) throw new Error('Unsafe package path');
      const path = join(stage, file.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, file.content, { flag: 'wx', mode: 0o600 });
    }
    await writeFile(join(stage, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    // Reserve the destination before moving files: no overwrite of an existing profile.
    await mkdir(target, { mode: 0o700 });
    try { await rename(stage, join(target, 'workspace')); }
    catch (error) { await rmdir(target); throw error; }
    return { directory: join(target, 'workspace'), digest: bundle.digest, files: bundle.files.length };
  } finally { await rm(stage, { recursive: true, force: true }); }
}
if (process.argv[1]?.endsWith('export-agent-package.ts')) {
  const [id, harness, destination] = process.argv.slice(2);
  if (!id || !harness || !destination) throw new Error('Usage: npm run packages:export -- <package-id> <openclaw|hermes|codex> <new-directory>');
  exportAgentPackage(id, harness, destination).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
