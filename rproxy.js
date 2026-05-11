const http = require('http');
const net = require('net');

function proxyRequest(req, res) {
    const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: 'localhost:3000' },
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
        }
    });

    req.pipe(proxyReq, { end: true });
}

const server = http.createServer(proxyRequest);

// Handle WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
    const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path: req.url,
        method: req.method,
        headers: req.headers,
    };

    const proxyReq = http.request(options);
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
    });
    proxyReq.on('error', (err) => {
        console.error('WS proxy error:', err.message);
        socket.end();
    });
    proxyReq.end();
});

server.listen(3001, '::', () => {
    console.log('Reverse proxy listening on port 3001 (IPv4+IPv6)');
});
