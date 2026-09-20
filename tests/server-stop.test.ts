import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stopServers } from "../scripts/stop.mjs";

test("stop isolates the checkout, waits for shutdown, and is idempotent", {
  skip: process.platform === "win32",
  timeout: 15000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ark stop "));
  const other = await mkdtemp(join(tmpdir(), "ark other "));
  const children: ChildProcess[] = [];
  t.after(async () => {
    await Promise.all(children.map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }));
    await Promise.all([rm(root, { recursive: true }), rm(other, { recursive: true })]);
  });

  async function server(cwd: string, title: string, shutdown: string) {
    const child = spawn(process.execPath, ["-e", `
      process.title = ${JSON.stringify(title)};
      process.on('SIGTERM', () => { ${shutdown} });
      require('node:http').createServer((_, res) => res.end('ok')).listen(0, '127.0.0.1', function () {
        process.send(this.address().port);
      });
    `], { cwd, stdio: ["ignore", "ignore", "inherit", "ipc"] });
    children.push(child);
    const [port] = await once(child, "message");
    return { child, url: `http://127.0.0.1:${port}` };
  }

  const next = await server(root, "next-server (v16.3.0)", "setTimeout(() => process.exit(0), 300)");
  const second = await server(root, "next-server (v16.3.0)", "process.exit(0)");
  const unrelated = await server(root, "other-node-server", "process.exit(0)");
  const otherProject = await server(other, "next-server (v16.3.0)", "process.exit(0)");
  const alias = join(other, "checkout-link");
  await symlink(root, alias, "dir");

  const started = Date.now();
  const stopped = await stopServers(alias);
  assert.deepEqual(stopped.sort(), [next.child.pid, second.child.pid].sort());
  assert.ok(Date.now() - started >= 300, "wait for graceful shutdown");
  await assert.rejects(fetch(next.url));
  assert.equal(await (await fetch(unrelated.url)).text(), "ok");
  assert.equal(await (await fetch(otherProject.url)).text(), "ok");
  assert.deepEqual(await stopServers(root), []);

  const stubborn = await server(root, "next-server (v16.3.0)", "/* ignore SIGTERM */");
  await assert.rejects(stopServers(root, 100), /Restart aborted/);
  assert.equal(await (await fetch(stubborn.url)).text(), "ok", "never force-kill a stuck server");
});
