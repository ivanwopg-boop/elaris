#!/bin/bash
set -e

echo "=== Deploy started at $(date) ===" > /root/deploy_output.log

# Install dependencies
apt-get update -qq 2>&1 | tee -a /root/deploy_output.log
apt-get install -y -qq git curl unzip build-essential python3 python3-pip 2>&1 | tee -a /root/deploy_output.log

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>&1 | tee -a /root/deploy_output.log
apt-get install -y -qq nodejs 2>&1 | tee -a /root/deploy_output.log

# Install pnpm
npm install -g pnpm 2>&1 | tee -a /root/deploy_output.log

# Install PM2
npm install -g pm2 2>&1 | tee -a /root/deploy_output.log

# Create app directory
mkdir -p /opt/elaris

# Clone from GitHub
cd /opt/elaris
rm -rf elaris 2>/dev/null
git clone https://github.com/ivanwopg-boop/elaris.git . 2>&1 | tee -a /root/deploy_output.log

# Setup backend venv
cd /opt/elaris/backend
python3 -m venv venv 2>&1 | tee -a /root/deploy_output.log
source venv/bin/activate
pip install -r requirements.txt 2>&1 | tee -a /root/deploy_output.log

# Setup frontend
cd /opt/elaris/frontend
pnpm install 2>&1 | tee -a /root/deploy_output.log

# Configure env - create real .env
cat > /opt/elaris/backend/.env << 'ENVEOF'
SECRET_KEY=persona-distiller-production-secret-key-change-this
MINIMAX_API_KEY=your-minimax-api-key-here
DEBUG=false
ALLOW_ORIGINS=https://150.158.23.130.nip.io
ENVEOF

# Start backend with PM2
cd /opt/elaris/backend
source venv/bin/activate
pm2 start python3 --name elaris-backend -- uvicorn app.main:app --port 8000 --host 0.0.0.0 2>&1 | tee -a /root/deploy_output.log

# Build frontend
cd /opt/elaris/frontend
pnpm build 2>&1 | tee -a /root/deploy_output.log

pm2 save 2>&1 | tee -a /root/deploy_output.log

echo "=== Deploy finished at $(date) ===" >> /root/deploy_output.log
cat /root/deploy_output.log