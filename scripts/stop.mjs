import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function inspect(command, args) {
  try {
    return (await exec(command, args, { timeout: 5000 })).stdout;
  } catch (error) {
    // Both tools return 1 with no output when no processes match.
    if (error.code === 1 && !error.stdout && !error.stderr) return "";
    if (error.code === "ENOENT") {
      throw new Error(`Required command '${command}' is missing. Install it and retry.`);
    }
    throw error;
  }
}

async function projectPids(root) {
  const output = await inspect("lsof", ["-a", "-d", "cwd", "-F", "p", "--", root]);
  return output.split("\n").filter((line) => /^p\d+$/.test(line))
    .map((line) => Number(line.slice(1)));
}

async function isNextServer(pid) {
  const output = await inspect("ps", ["-p", String(pid), "-o", "stat=", "-o", "args="]);
  // Next sets this title in start-server for both dev and production.
  // Exclude zombies, which cannot serve requests but may await parent reaping.
  return /^(?!Z)\S+\s+next-server \(v[^\s)]+\)\s*$/.test(output.trim());
}

export async function stopServers(root = projectRoot, timeoutMs = 10000) {
  if (process.platform === "win32") {
    throw new Error("The stop/restart scripts require macOS or Linux with lsof and ps (or WSL).");
  }
  const directory = await realpath(root);
  const stopped = [];
  for (const pid of await projectPids(directory)) {
    if (!(await isNextServer(pid))) continue;
    // Recheck the working directory immediately before signaling; never kill by port.
    if (!(await projectPids(directory)).includes(pid)) continue;
    try {
      process.kill(pid, "SIGTERM");
      stopped.push(pid);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }

  const deadline = Date.now() + timeoutMs;
  let pending = stopped;
  while (pending.length) {
    const alive = await Promise.all(pending.map(isNextServer));
    pending = pending.filter((_, index) => alive[index]);
    if (!pending.length) break;
    if (Date.now() >= deadline) {
      throw new Error(`Next.js did not stop within ${timeoutMs}ms (PID ${pending.join(", ")}). Restart aborted; inspect these processes before retrying.`);
    }
    await delay(100);
  }
  return stopped;
}

async function main() {
  try {
    const stopped = await stopServers();
    console.log(stopped.length
      ? `Stopped Next.js for this checkout (PID ${stopped.join(", ")}).`
      : "No Next.js server is running for this checkout.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
