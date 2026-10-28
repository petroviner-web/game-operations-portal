import { spawn } from 'node:child_process';

// One hosting instance owns both servers. An unexpected exit stops the sibling,
// allowing the hosting platform to restart the whole application consistently.
export async function serveRelease(commands, env, stopTimeoutMs = 10000) {
  const children = [];
  let stopping = false;
  let exitCode = 0;
  let timer;
  function stop(failed = false) {
    if (failed) exitCode = 1;
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    timer = setTimeout(() => {
      for (const child of children) child.kill('SIGKILL');
    }, stopTimeoutMs);
    timer.unref();
  }
  const onSignal = () => stop();
  const onMessage = (message) => {
    if (message === 'shutdown') stop(); // Also permits portable local smoke-test cleanup.
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('message', onMessage);
  try {
    await Promise.all(
      commands.map(
        ({ name, args, cwd }) =>
          new Promise((resolve) => {
            const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
            children.push(child);
            child.on('error', () => {
              console.error(`${name} could not start.`);
              stop(true);
            });
            child.on('close', () => {
              children.splice(children.indexOf(child), 1);
              if (!stopping) {
                console.error(`${name} exited unexpectedly.`);
                stop(true);
              }
              resolve();
            });
          }),
      ),
    );
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    process.off('message', onMessage);
  }
  return exitCode;
}
