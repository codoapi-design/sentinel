const { spawn } = require('child_process');
const path = require('path');

function startServer() {
    console.log('Starting Next.js server...');
    
    const env = { ...process.env, PORT: '3000', HOSTNAME: '::' };
    const server = spawn('node', [path.join(__dirname, '.next/standalone/server.js')], {
        env,
        stdio: 'inherit',
        cwd: __dirname
    });
    
    server.on('close', (code, signal) => {
        console.log(`Server exited with code ${code}, signal ${signal}. Restarting in 3s...`);
        setTimeout(startServer, 3000);
    });
    
    server.on('error', (err) => {
        console.error('Failed to start server:', err);
        setTimeout(startServer, 3000);
    });
    
    // Handle signals
    process.on('SIGTERM', () => {
        server.kill('SIGTERM');
        process.exit(0);
    });
    
    process.on('SIGINT', () => {
        server.kill('SIGINT');
        process.exit(0);
    });
}

startServer();
