/**
 * PM2 ecosystem config for production deployment
 * Start with: `pm2 start ecosystem.config.js --env production`
 */
module.exports = {
  apps: [
    {
      name: 'dashboard-overview-api',
      script: './dist/server.js',
      // Absolute path so PM2 resolves script/logs correctly regardless of cwd
      cwd: __dirname,
      // Use fork mode to avoid memory-store sharing issues with rate limiters
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      // Logs (PM2 will still manage own logs under ~/.pm2/logs but these are handy)
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      combine_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};
