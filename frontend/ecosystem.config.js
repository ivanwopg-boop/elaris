module.exports = {
  apps: [{
    name: 'elaris-frontend',
    cwd: '/opt/elaris/frontend',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};