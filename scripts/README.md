# scripts/ — smoke tests and demo tools
**Owners: P2 (smoke tests, bootstrap), P1 (simulate, reset)**

- `smoke_bedrock.py`, `smoke_akamai.py`, `smoke_devrev.py`: run first, in the first hour
- `devrev_bootstrap.py`: create parts, vendor groups, tags
- `seed.py`: load the KC data and the demo hotspot
- `simulate.py`: 1,243 reports in under 15 s
- `reset.py`: must flush `phash:*`, `rl:*`, `evt:stream`, then re-seed
- `gen_badges.py`: badge art, one call at a time
