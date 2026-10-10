# infra/ — how it runs on Akamai Cloud
**Owner: P2**

- `docker-compose.yml`: caddy, api, postgres, valkey
- `Caddyfile`: HTTPS, serves the built web app, proxies `/api`, SSE flush on
- `deploy.sh`: build the web app locally, `rsync dist/`, restart containers (target: under 60 s)
- Linode setup notes: firewall 22/80/443; secrets go through the shared vault and scp, never git
