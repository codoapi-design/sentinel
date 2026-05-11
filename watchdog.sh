#!/bin/bash
while true; do
    cd /home/z/my-project
    HOSTNAME="::" PORT=3000 node .next/standalone/server.js 2>&1
    echo "Server exited, restarting in 2s..."
    sleep 2
done
