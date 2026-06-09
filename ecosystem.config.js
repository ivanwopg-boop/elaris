module.exports = {
  apps: [{
    name: 'elaris-backend',
    cwd: '/opt/elaris/backend',
    script: 'venv/bin/uvicorn',
    args: 'app.main:app --host 0.0.0.0 --port 8000',
    interpreter: '/opt/elaris/backend/venv/bin/python3',
    restart_delay: 5000,
    max_restarts: 10,
    max_memory_restart: '300M',
    env: { PYTHONPATH: '/opt/elaris/backend' }
  }, {
    name: 'elaris-frontend',
    cwd: '/opt/elaris/frontend',
    script: 'node_modules/.bin/next',
    args: 'start -p 3000',
    restart_delay: 5000,
    max_restarts: 10,
    max_memory_restart: '300M'
  }]
};
