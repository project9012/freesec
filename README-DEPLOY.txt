How to run this build
======================

1. Copy this whole folder to your server.
2. npm install --omit=dev
3. Create a .env file (see .env.example) with your real NVIDIA_API_KEY.
4. NODE_ENV=production node dist/server.cjs
5. App serves on http://<your-host>:3000
