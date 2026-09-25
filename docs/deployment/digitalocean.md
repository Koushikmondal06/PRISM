# PRISM Backend - DigitalOcean Deployment Guide

This guide details how to deploy the PRISM indexer and backend on a clean DigitalOcean Ubuntu Droplet for a production environment. 

## Prerequisites
- A DigitalOcean Ubuntu 22.04 (or newer) Droplet.
- Domain name pointed to the Droplet's IP address (optional but recommended for HTTPS).

## 1. Create Deployment User
For security, the application should not run as root.
```bash
adduser prism
usermod -aG sudo prism
su - prism
```

## 2. Install Dependencies (Node.js & Git)
Install Node.js (v20+ recommended) and Git.
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential nginx
```

## 3. Clone Repository
```bash
git clone <repository-url> prism
cd prism
```

## 4. Install Application Dependencies
```bash
npm install
```

## 5. Configure Environment Variables
Create the server `.env` file.
```bash
nano .env
```
Populate with your production values (do not share these):
```env
NODE_ENV=production
DATABASE_URL=postgres://user:pass@host:port/db?sslmode=require
SOLANA_RPC_URL=https://api.devnet.solana.com
GAMMA_API_URL=https://gamma-api.polymarket.com
GAMMA_REFRESH_INTERVAL_MS=900000
PRISM_DATA_DIR=/home/prism/prism/data
MARKETS_JSON_PATH=/home/prism/prism/data/markets.json
POLYMARKET_SELECTION_PATH=/home/prism/prism/data/polymarket-selection.json
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://your-frontend-domain.com
```

## 6. Build the Application
Ensure the indexer is compiled for production:
```bash
npm run build -w @prism/indexer
```

## 7. Verify Data Integrity
Perform a single dry-run to ensure database connectivity and API syncs are fully functional before daemonizing:
```bash
npm run once -w @prism/indexer
```

## 8. Start Production Service via PM2
Use PM2 to manage the Node process.
```bash
sudo npm install -g pm2
pm2 start npm --name "prism-indexer" -- run start -w @prism/indexer
pm2 save
pm2 startup
```

## 9. Verify Service Health
Check the internal health endpoint:
```bash
curl http://127.0.0.1:3000/health
```

## 10. Configure Nginx Reverse Proxy
Create an Nginx configuration block to proxy external traffic securely.
```bash
sudo nano /etc/nginx/sites-available/prism
```
```nginx
server {
    listen 80;
    server_name your-backend-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/prism /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## 11. HTTPS (Certbot)
Use Let's Encrypt to secure the endpoint:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-backend-domain.com
```

## 12. Updates and Maintenance
To update the deployment:
```bash
cd ~/prism
git pull
npm install
npm run build -w @prism/indexer
pm2 restart prism-indexer
```
To view logs:
```bash
pm2 logs prism-indexer
```
