const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('<h1>Test Server Running</h1><p>Port 3001</p>');
});
server.listen(3001, '::', () => {
    console.log('Test server on port 3001');
});
