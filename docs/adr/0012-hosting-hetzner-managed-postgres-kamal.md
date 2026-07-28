# Hosting: EU-resident Hetzner compute + managed Postgres, deployed with Kamal

**Context.** GarageFlow processes EU residents' personal data from day one (ADR-0004) and targets a cost-sensitive Bulgarian market (ADR-0008). The workload holds short locking transactions (ADR-0002) and will grow a public API and background sends — a profile better served by a long-running server than by serverless functions. There is no pre-existing company infrastructure to reuse.

**Decision.**
- **Compute:** a long-running Next.js Node server in Docker on a **Hetzner** VPS in an EU region — the cheapest real EU compute — deployed with **Kamal** (zero-downtime releases, automatic Let's Encrypt TLS via its proxy, minimal config).
- **Database:** a **managed** PostgreSQL instance in the EU (Neon or Supabase), chosen for automated backups / point-in-time restore because it stores legally-retained invoices — the one place we do not economise.
- **Data residency:** application and database both stay in the EU.
- **Object storage** for media (photos) is S3-compatible (Cloudflare R2 or Hetzner Object Storage) and is decided in the GF-11 media ADR, not here.

**Consequences.** A long-running server avoids the connection-pool and cold-start gymnastics serverless imposes on the locking path. Hetzner trades a little setup effort for the lowest cost; Kamal absorbs most of that (proxy, TLS, releases), so the earlier stopgap of a separate Caddy reverse proxy is dropped. Splitting cheap disposable compute (Hetzner) from safe durable data (managed Postgres) is a deliberate cost/safety trade. Fiscal/НАП obligations remain the shop's responsibility (ADR-0006).
