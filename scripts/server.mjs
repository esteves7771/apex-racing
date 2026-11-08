import { spawn } from 'node:child_process';
export async function startServer(port = 5174, preview = false) {
  const server = spawn(
    process.execPath,
    preview
      ? [
          'node_modules/vite/bin/vite.js',
          ...(preview ? ['preview'] : []),
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--strictPort',
        ]
      : [
          '--input-type=module',
          '-e',
          `import {createServer} from 'vite'; const s=await createServer({server:{host:'127.0.0.1',port:${Number(port)},strictPort:true,hmr:false,watch:null}});await s.listen();`,
        ],
    { stdio: 'pipe', windowsHide: true },
  );
  server.stderr.on('data', (data) => console.error(String(data)));
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch('http://127.0.0.1:' + port);
      if (response.ok) return server;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  server.kill();
  throw Error('Local Vite did not start');
}
