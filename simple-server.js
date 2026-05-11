const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('<h1>Hello from port 3002!</h1>');
});
server.listen(3002, '::', () => {
    console.log('Simple server on port 3002 (IPv4+IPv6)');
});
