# Deploy Civic Flow to Akamai Cloud (Linode)

One Ubuntu 24.04 server, no Docker. The deploy script installs Python, Caddy (automatic HTTPS) and a small key-value server, runs the API as a systemd service, and serves two web apps from the same backend and database: a **citizen app** and a **city staff portal**. Judges open the citizen address on their phones and the city address on a laptop.

You need: this repo on your Windows PC, a filled-in `.env` (your keys), Node.js (already installed by `setup.ps1`) and a Linode account.

## 1. Make an SSH key (once)

In PowerShell:

```powershell
ssh-keygen -t ed25519
```

Press Enter for the default file and (optionally) a passphrase. Then show the **public** key:

```powershell
cat ~/.ssh/id_ed25519.pub
```

Copy the whole line (starts with `ssh-ed25519`). Never share the file without `.pub`.

## 2. Create the Linode

In Cloud Manager (cloud.linode.com): **Create > Linode**.

| Setting | Value |
|---|---|
| Image | Ubuntu 24.04 LTS |
| Region | Chicago, IL or Dallas, TX (closest to Kansas City) |
| Plan | Shared CPU, Linode 4 GB |
| Label | `civicflow` |
| Root password | Make a strong one and store it in a password manager |
| SSH keys | Add the public key from step 1 |

Click **Create Linode**, wait until it says **Running** (about a minute), then copy its **IPv4** address.

## 3. Deploy

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File infra/linode/deploy.ps1 -Ip <ip>
```

Optional switches:

| Switch | Meaning |
|---|---|
| `-SkipBuild` | Reuse `frontend\dist\citizen` and `frontend\dist\city` (faster when only backend code changed) |
| `-Domain my.example.com` | Use your own domain (its DNS A record, and one for `city.my.example.com`, must point at the IP). Default is `<ip-with-dashes>.sslip.io`, which works with no DNS setup |
| `-CityPass "..." [-CityUser city]` | Password-protect `/api/admin/*` (see Security) |
| `-DemoMode false` | Turn off the relaxed demo checks (default `true`) |
| `-ResetData` | Wipe the server database and uploaded photos (it reseeds the demo data) |
| `-KeyPath`, `-User`, `-EnvFile` | Non-default key, SSH user or env file |

## 3a. The two addresses and the two roles

| Role | URL | Who |
|---|---|---|
| Citizen app (phone-first) | `https://<ip-with-dashes>.sslip.io/` | Residents: report an issue, see only their own requests |
| City portal (staff) | `https://city.<ip-with-dashes>.sslip.io/` | City staff: map, queue, ops, vendor, workflow, analytics |

`sslip.io` resolves any sub-name to the same IP, so `city.` needs no DNS work. With your own domain via `-Domain`, add a second A record for `city.<your-domain>` pointing at the same IP. Caddy gets one certificate per name (the first takes up to a minute each).

- **Demo PIN:** the city portal asks for the PIN `city` (lowercase). It is a demo-level gate in the browser, not real security.
- **Staff token:** after the PIN, the portal sends `X-Role-Token: civicflow-city-demo` and the server (env `CITY_TOKEN`) refuses staff routes (`/api/admin/*`, `/api/tickets*`, `/api/vendor/*`, `/api/analytics/*`, `/api/devrev/*`, clusters, stats, events, nearby, geofence layers) with 403 without it. The deploy sets `CITY_TOKEN=civicflow-city-demo` unless your local `.env` defines another value; it is kept across redeploys. The token is visible in the city web bundle, so treat it as a demo speed bump, not protection of sensitive data.
- Both hostnames reach the same API, so the citizen sees only their own requests (`/api/me/requests`) while staff see everything.

**Test each role after deploy**

1. Citizen: open the citizen URL on a phone, report an issue, then open My Requests. There is no map of other reports and no ops or vendor pages.
2. City: open the city URL, enter `city`, and confirm the map, queue, Ops, Vendor and Workflow pages load.
3. Token check: `curl -s -o /dev/null -w "%{http_code}" https://<domain>/api/tickets` should print `403`; with `-H "X-Role-Token: civicflow-city-demo"` it prints `200`.
4. Optional second layer: `-CityPass` adds a browser password on `/api/admin/*` for both hostnames.

## 4. What you will see

1. Frontend build, then packing (under a minute).
2. Upload (a few MB), then the server setup. **First run takes about 3 to 6 minutes** (apt packages and pip). Re-runs take about 1 minute because unchanged packages are skipped.
3. The script waits for `https://<ip-with-dashes>.sslip.io/api/health` and `https://city.<ip-with-dashes>.sslip.io/` (up to 2 minutes each). The first certificate per name takes 10 to 60 seconds.
4. It prints the Citizen app and City portal links. Open the Citizen link on your phone to test the camera and location prompts.

Your local `.env` is never changed. The server gets a copy with `PUBLIC_BASE_URL` (the citizen URL), `DB_PATH`, `EDGEKV_BACKEND=valkey`, `DEMO_MODE` and `CITY_TOKEN` adjusted. If the key-value server is down the app quietly falls back to its in-memory cache.

## 5. Updating after code changes

Run the same command again. It uploads new code and frontend, restarts the API, and keeps the database and photos.

```powershell
powershell -ExecutionPolicy Bypass -File infra/linode/deploy.ps1 -Ip <ip> -SkipBuild   # backend-only changes
powershell -ExecutionPolicy Bypass -File infra/linode/deploy.ps1 -Ip <ip>              # full
```

## 6. Logs, restart, rollback

```powershell
ssh root@<ip> "journalctl -u civicflow-api -f"        # live API log (Ctrl+C to stop)
ssh root@<ip> "journalctl -u caddy -n 50 --no-pager"  # web server / certificate log
ssh root@<ip> "systemctl restart civicflow-api"
ssh root@<ip> "systemctl status civicflow-api caddy --no-pager"
```

On the server: app in `/opt/civicflow`, data in `/opt/civicflow/data` (`civicflow.db`, `photos/`), config in `/opt/civicflow/.env`.

Rollback: check out the previous version of the code on your PC and run the deploy again. To start the demo data over: add `-ResetData`. To back up the database first: `scp root@<ip>:/opt/civicflow/data/civicflow.db .`

## 7. Security notes

- The server holds your `.env` keys (Akamai, DevRev, and so on) in `/opt/civicflow/.env`, readable only by the `civic` user. Anyone with root access to the Linode can read them.
- Only ports 22, 80 and 443 are open (firewall `ufw`). The API (8000) and key-value server (6379) listen on 127.0.0.1 only.
- **Optional admin password.** The Ops page calls `/api/admin/simulate` and `/api/admin/reset`. Anyone with the link can press them, so for a public demo add `-CityPass "choose-one" ` (user `city`). The password is hashed on the server with `caddy hash-password` and never printed or stored in the repo. **The browser will pop up a login box once** when someone uses those Ops buttons; judges who only watch can ignore it. It is kept across redeploys; to switch it off, remove the `CITY_*` lines from `/opt/civicflow/.env` on the server and re-run the deploy.
  Manual way: run `caddy hash-password` on the server, then put `CITY_USER=city` and `CITY_PASS_HASH=<hash>` in `/opt/civicflow/.env` and re-run the deploy.
- Rotate every key you put on the server (Akamai, DevRev, Bedrock) after the event.
- **Delete the Linode after the hackathon** (Cloud Manager > the Linode > Settings > Delete) so billing stops.

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `Cannot log in over SSH` | Wrong IP, Linode not Running, or the Linode was created without your public key. Add it in Cloud Manager (Account > SSH Keys) and rebuild, or check `-KeyPath`. If you reused an IP, delete its old line in `%USERPROFILE%\.ssh\known_hosts` |
| Citizen works but `city.` does not (or the reverse) | Each name needs its own certificate and DNS entry. `nslookup city.<domain>`; `journalctl -u caddy -n 50`. With a custom domain add the `city.` A record |
| Browser says certificate error or the site never loads | Caddy could not get a certificate. Check `journalctl -u caddy -n 50`. Port 80 must be reachable (no Cloud Firewall in front of the Linode), and the name must resolve to the IP (`nslookup <domain>`). With your own domain wait for DNS, then `systemctl restart caddy`. Let's Encrypt limits repeated failures, so wait a few minutes before retrying |
| `502 Bad Gateway` from Caddy | The API is not running. `systemctl status civicflow-api` and `journalctl -u civicflow-api -n 50` |
| API will not start | Look for a missing package or a typo in `.env` in the log. `ssh root@<ip> "cd /opt/civicflow && sudo -u civic .venv/bin/python -c 'import backend.api.main'"` shows the import error. Fix, then redeploy |
| Live updates (Ops page) do not stream | Something is buffering Server-Sent Events. Test: `curl -N https://<domain>/api/events` should print events as they happen. The Caddyfile uses `flush_interval -1` and does not compress `/api/*`; check you did not edit `/etc/caddy/Caddyfile`. Then `systemctl restart caddy` |
| AI steps show template text | A key in `.env` is missing or mistyped on the server. Fix the local `.env`, redeploy |
| Phone cannot use camera or location | The page must be `https://` (it is) and the browser permission must be allowed for the site |
| `PowerShell: running scripts is disabled` | Use the full command above (it includes `-ExecutionPolicy Bypass`) |

## 9. Extras

- **DevRev webhooks:** once the site is up, DevRev can deliver webhooks to `https://<domain>/` (use the path the backend exposes for webhooks; Caddy forwards every `/api/*` path to the API). Set `DEVREV_MODE=live` and the DevRev values in your local `.env`, then redeploy.
- **Object Storage (optional):** to keep photos in Akamai Object Storage instead of the server disk, create a bucket and set `STORAGE=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET` in your local `.env`, then redeploy. The default (`STORAGE=local`) needs nothing extra.
