import {createServer} from 'node:http';

const port = Number(process.env.PORT ?? 8787);
const seen = new Set();
let forceStatus = Number(process.env.FORCE_STATUS ?? 0);

createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response
      .writeHead(200, {'content-type': 'application/json'})
      .end(JSON.stringify({ok: true, uniqueIds: seen.size}));
    return;
  }

  if (request.method === 'POST' && request.url === '/events') {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      raw += chunk;
    });
    request.on('end', () => {
      try {
        const event = JSON.parse(raw);
        console.log(
          JSON.stringify({
            receivedAt: new Date().toISOString(),
            event: event.name,
            source: event.source,
            params: event.params,
          }),
        );
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/locations') {
    response.writeHead(404).end();
    return;
  }

  let body = '';
  request.setEncoding('utf8');
  request.on('data', chunk => {
    body += chunk;
  });
  request.on('end', () => {
    try {
      const payload = JSON.parse(body);
      const locations = Array.isArray(payload.locations)
        ? payload.locations
        : Array.isArray(payload)
          ? payload
          : [payload];
      const duplicates = locations.filter(location => seen.has(location.id));
      for (const location of locations) {
        if (location?.id) seen.add(location.id);
      }
      const last = locations[locations.length - 1] ?? {};
      console.log(
        JSON.stringify({
          receivedAt: new Date().toISOString(),
          count: locations.length,
          duplicates: duplicates.length,
          last: {
            latitude: last.latitude,
            longitude: last.longitude,
            accuracy: last.accuracy,
            odometer: last.odometer,
            isMoving: last.isMoving,
            activity: last.activity,
            recordedAt: last.recordedAt,
          },
          ids: locations.map(location => location.id),
        }),
      );
      const status = forceStatus || 200;
      response
        .writeHead(status, {'content-type': 'application/json'})
        .end(
          JSON.stringify({
            accepted: status < 300 ? locations.map(location => location.id) : [],
            duplicates: duplicates.map(location => location.id),
          }),
        );
    } catch {
      response
        .writeHead(400, {'content-type': 'application/json'})
        .end(JSON.stringify({error: 'invalid_json'}));
    }
  });
}).listen(port, '0.0.0.0', () => {
  console.log(`locX mock server listening on http://0.0.0.0:${port}/locations`);
});
