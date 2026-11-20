// Starts the API and the worker together, for the one-command run in README and capstone.yaml.
// They stay two separate processes (a broken mail server never touches the API); this only
// launches both, forwards Ctrl+C to both, and stops the other one if either exits.
// For development, run them in two terminals instead: `npm run dev` and `npm run worker`.
import { spawn } from "node:child_process";

const processes = [
  { name: "api", script: "src/server.js" },
  { name: "worker", script: "src/jobs/worker.js" },
].map(({ name, script }) => {
  const child = spawn(process.execPath, ["--env-file=.env", script], { stdio: "inherit" });
  child.on("exit", (code, signal) => {
    console.error(`[start-all] ${name} exited (${signal ?? code}); stopping the rest`);
    stopAll();
    process.exitCode = code ?? 1;
  });
  return child;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (child.exitCode === null) child.kill("SIGTERM");
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
