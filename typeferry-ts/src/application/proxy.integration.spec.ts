import { createServer as createHttpServer, request } from 'node:http';
import type { Server as HttpServer } from 'node:http';

import { createServer as createViteServer } from 'vite';
import { expect, it } from 'vitest';

import { resolveApplicationConfig } from './config';
import { createTypeFerryDevProxy } from './proxy';

async function listen(server: HttpServer): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing listener address');
  return address.port;
}

async function close(server: HttpServer): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

it('streams selected host requests and leaves other hostnames to the SPA', async () => {
  let receivedHost: string | undefined;
  let receivedBytes = 0;
  const backend = createHttpServer((incoming, outgoing) => {
    receivedHost = incoming.headers.host;
    incoming.on('data', (chunk: Buffer) => { receivedBytes += chunk.length; });
    incoming.once('end', () => {
      outgoing.writeHead(200, { 'content-type': 'text/plain' });
      outgoing.write('first');
      outgoing.end('second');
    });
  });
  const backendPort = await listen(backend);
  const { development } = resolveApplicationConfig('/workspace/application', {
    development: { proxyRoutes: [{
      pathPrefix: '/blog', hostnames: ['showcase.localhost'], preserveHostHeader: true,
    }] },
  });
  const vite = await createViteServer({
    configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    plugins: [createTypeFerryDevProxy(backendPort, development.proxyRoutes)],
  });
  vite.middlewares.use((_incoming, outgoing) => { outgoing.end('spa'); });
  const browser = createHttpServer(vite.middlewares);
  const browserPort = await listen(browser);

  try {
    const body = 'x'.repeat(128 * 1024);
    const responseBody = await new Promise<string>((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1', port: browserPort, method: 'POST', path: '/blog/article?test=1',
        headers: { Host: `showcase.localhost:${browserPort}` },
      }, incoming => {
        let result = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk: string) => { result += chunk; });
        incoming.once('end', () => resolve(result));
        incoming.once('error', reject);
      });
      outgoing.once('error', reject);
      outgoing.write(body.slice(0, body.length / 2));
      outgoing.end(body.slice(body.length / 2));
    });
    expect(responseBody).toBe('firstsecond');
    expect(receivedHost).toBe(`showcase.localhost:${browserPort}`);
    expect(receivedBytes).toBe(body.length);

    for (const [host, path] of [['localhost', '/blog/article'], ['showcase.localhost', '/blogger']] as const) {
      const response = await fetch(`http://127.0.0.1:${browserPort}${path}`, {
        headers: { Host: `${host}:${browserPort}` },
      });
      expect(await response.text()).toBe('spa');
    }
  } finally {
    await close(browser);
    await vite.close();
    await close(backend);
  }
});
