import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const baseUrl = 'http://127.0.0.1:5173/dev/starlink';
const isCi = Boolean(process.env.CI);
const testCommand = 'pnpm exec playwright test';

function spawnShell(command) {
  return spawn(command, {
    shell: true,
    stdio: 'inherit',
  });
}

async function waitForServer(url, timeoutMs = 90_000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`server responded with ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError ?? new Error(`server did not become ready: ${url}`);
}

async function main() {
  const server = await createServer({
    mode: 'e2e',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
  });
  let exitCode = 1;

  try {
    await server.listen();
    server.printUrls();
    await waitForServer(baseUrl);
    console.log(`[e2e] CI=${isCi ? 'true' : 'false'} command="${testCommand}"`);

    exitCode = await new Promise((resolve) => {
      const tests = spawnShell(testCommand);
      tests.on('exit', (code) => resolve(code ?? 1));
      tests.on('error', () => resolve(1));
    });
  } finally {
    await server.close();
  }

  process.exit(exitCode);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
