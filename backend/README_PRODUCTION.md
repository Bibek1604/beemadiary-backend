# Production Deploy Notes

Quick steps to run this backend in production using PM2 on a VPS.

1) Build the project

```bash
# from backend/backend
npm install --production
npm run build
```

2) Start with PM2

```bash
# install pm2 globally once
npm install -g pm2

# start using the ecosystem file (runs in production env)
pm2 start ecosystem.config.js --env production

# save the process list so it restarts on boot
pm2 save

# generate and run startup script for your platform (follow printed command)
pm2 startup
```

3) Useful pm2 commands

```bash
pm2 status
pm2 logs dashboard-overview-api --lines 200
pm2 restart dashboard-overview-api
pm2 stop dashboard-overview-api
pm2 delete dashboard-overview-api
```

4) Environment and TLS
- Provide production secrets via environment variables or a secrets manager. Do NOT commit secrets to the repo.
- Ensure TLS is terminated at the VPS (NGINX/Cloud) and redirects HTTP -> HTTPS.

5) Health checks and monitoring
- Use the `/health` endpoint for liveness checks.
- Integrate with monitoring/alerting (Prometheus, Datadog, etc.) for uptime and error-rate alerts.

6) Logs
- App logs are written to `./logs/` by the app and PM2 keeps its own logs under `~/.pm2/logs`.
- Ensure log rotation on the server (logrotate) or use a central logging service.

If you want, I can also add a sample `nginx` conf for reverse proxy + SSL and a systemd startup alternative.

-- Manual deploy script (no CI/CD)

If you place the repository on the VPS under a production folder (for example `/home/deploy/backend`), you can use the included `deploy.sh` to pull latest changes and restart the PM2 process.

Usage on the server:

```bash
cd /path/to/backend/backend
./deploy.sh
```

What `deploy.sh` does:
- Runs `git pull` to fetch the latest code
- Installs production dependencies (`npm ci --production`)
- Builds the project (`npm run build`)
- Ensures `./logs` exists and is writable
- Starts or reloads the PM2 process using `ecosystem.config.js` (production env)

You should run `pm2 save` once after the first successful start so PM2 restarts the app on system reboot.
