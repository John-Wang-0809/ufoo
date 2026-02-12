const OnlineServer = require('../../../src/online/server');

function httpRequest({ method, url, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const data = body ? JSON.stringify(body) : null;
    const mergedHeaders = { 'Content-Type': 'application/json', ...headers };
    const req = http.request(url, { method, headers: mergedHeaders }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk.toString()));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') });
        } catch {
          resolve({ status: res.statusCode, data: {} });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('OnlineServer channels (HTTP)', () => {
  test('create + list channels', async () => {
    const server = new OnlineServer({ host: '127.0.0.1', port: 0, tokens: ['x'] });
    await server.start();
    const base = `http://127.0.0.1:${server.port}/ufoo/online/channels`;
    const authHeaders = { Authorization: 'Bearer x' };

    const create = await httpRequest({
      method: 'POST',
      url: base,
      body: { name: 'world-chat', type: 'world' },
      headers: authHeaders,
    });
    expect(create.status).toBe(200);
    expect(create.data.ok).toBe(true);
    expect(create.data.channel.channel_id).toMatch(/^channel_\d{6}$/);

    const list = await httpRequest({ method: 'GET', url: base, headers: authHeaders });
    expect(list.status).toBe(200);
    expect(list.data.channels.length).toBe(1);
    expect(list.data.channels[0].channel_id).toBeDefined();

    await server.stop();
  }, 15000);
});
