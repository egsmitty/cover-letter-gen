#!/bin/bash
set -e

if [ ! -f "server/.env" ]; then
  echo "Error: server/.env not found. Copy server/.env.example to server/.env and add your API key."
  exit 1
fi

echo "Starting server..."
cd server && npm run dev &
SERVER_PID=$!
cd ..

echo "Waiting for server to be ready..."
for i in $(seq 1 10); do
  if curl -s http://localhost:3001 > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Starting client..."
cd client && npm run dev &
CLIENT_PID=$!
cd ..

echo ""
echo "Running at http://localhost:5173"
echo "Press Ctrl+C to stop."

trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null" EXIT
wait
