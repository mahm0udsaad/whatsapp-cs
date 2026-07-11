// PM2 config for the isolated wa-export service.
// Deployed to the VPS at /var/www/wa-export. Never shares state with openwa-api.
module.exports = {
  apps: [
    {
      name: 'wa-export',
      cwd: '/var/www/wa-export',
      script: 'src/server.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1200M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
