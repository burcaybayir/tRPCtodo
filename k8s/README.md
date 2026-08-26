# Kubernetes deployment (GKE)

Manifests for running the app on GKE. Plain YAML, no Helm, no Kustomize, no
service mesh — the point is the core objects, not the tooling around them.

Every file carries comments explaining *why* it looks the way it does. This
README covers the parts that live between files: order, migrations, and what
breaks at more than one replica.

---

## What is here

| File | What it creates |
|---|---|
| `namespace.yaml` | The `trpctodo` namespace everything else lives in |
| `secret.yaml` | **Template.** `DATABASE_URL`, `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD` |
| `configmap.yaml` | `NODE_ENV`, `PORT`, `NEXT_TELEMETRY_DISABLED` |
| `postgres-statefulset.yaml` | Postgres StatefulSet + its PVC template + a headless Service |
| `migration-job.yaml` | One-off Job running `prisma migrate deploy` |
| `app-deployment.yaml` | The Next.js app, 2 replicas, probes, resources |
| `app-service.yaml` | ClusterIP Service in front of the app pods |
| `ingress.yaml` | GCE Ingress + a BackendConfig for the WebSocket timeout |
| `hpa.yaml` | HorizontalPodAutoscaler, 2–10 pods on CPU |

---

## Before you start

The app no longer runs on SQLite. `prisma/schema.prisma` targets PostgreSQL,
and the migrations under `prisma/migrations/` were regenerated as Postgres DDL —
the previous SQLite migrations could not be replayed against Postgres, since
migration SQL is dialect-specific.

For local development, `docker-compose.yml` at the repository root starts a
matching Postgres:

```bash
docker compose up -d db
npx prisma migrate deploy
npm run dev
```

### Build and push the image

```bash
export PROJECT_ID=your-gcp-project
export TAG=$(git rev-parse --short HEAD)

docker build -t gcr.io/$PROJECT_ID/trpctodo:$TAG .
docker push gcr.io/$PROJECT_ID/trpctodo:$TAG
```

Then replace `REGISTRY/trpctodo:TAG` in `app-deployment.yaml` and
`migration-job.yaml`. Use the git SHA, never `:latest` — with a floating tag,
two pods created a minute apart can be running different code, and there is
nothing to roll back to.

---

## Deploy order

Order matters because of what each step depends on. Kubernetes will happily
accept objects in the wrong order and leave them stuck.

### 1. Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

Everything below is namespaced; without it, each `apply` fails with
`namespaces "trpctodo" not found`.

### 2. Secret and ConfigMap

```bash
kubectl apply -f k8s/configmap.yaml

# Do NOT apply secret.yaml with the placeholder values. Create it directly so
# the real values never land in a file:
kubectl -n trpctodo create secret generic trpctodo-secrets \
  --from-literal=DATABASE_URL='postgresql://trpctodo:REAL_PASSWORD@postgres:5432/trpctodo?schema=public' \
  --from-literal=ANTHROPIC_API_KEY='sk-ant-...' \
  --from-literal=POSTGRES_PASSWORD='REAL_PASSWORD'
```

Config comes before workloads because a pod with `envFrom` referencing a
missing object stays in `CreateContainerConfigError` — it never starts, and the
error only shows up in `kubectl describe pod`, not in the logs.

The password inside `DATABASE_URL` and the standalone `POSTGRES_PASSWORD` must
match: one is what the app connects with, the other is what Postgres
initialises. A mismatch looks like the app crash-looping on `password
authentication failed` while Postgres itself reports perfectly healthy.

### 3. Postgres

```bash
kubectl apply -f k8s/postgres-statefulset.yaml
kubectl -n trpctodo rollout status statefulset/postgres
```

Wait for it. The migration Job connects on its first attempt, and a Job that
starts before the database is accepting connections just burns through its
`backoffLimit`.

### 4. Migration

```bash
kubectl apply -f k8s/migration-job.yaml
kubectl -n trpctodo wait --for=condition=complete job/trpctodo-migrate --timeout=120s
kubectl -n trpctodo logs job/trpctodo-migrate
```

**Migrations run here, not on app startup.** The reasoning is in the comments at
the top of `migration-job.yaml`; the short version is that a start-up migration
runs once per pod, races itself across replicas, re-runs on every restart, and
turns a failed schema change into an undiagnosable `CrashLoopBackOff`.

The Job uses the *same image* as the app, so the migrations applied are exactly
the ones that shipped with this code — which is why `prisma` is a runtime
dependency rather than a dev one.

A `Job`'s spec is immutable. To run a new migration for the next release, give
the Job a new name (`trpctodo-migrate-<tag>`) or delete the old one first.

### 5. App, Service, Ingress, HPA

```bash
kubectl apply -f k8s/app-deployment.yaml
kubectl -n trpctodo rollout status deployment/trpctodo-app

kubectl apply -f k8s/app-service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
```

The Ingress takes several minutes to become useful — GKE provisions a real
Google Cloud load balancer behind it, and its health checks must pass before it
serves traffic. `kubectl -n trpctodo get ingress -w` until `ADDRESS` is
populated; 502s in the first few minutes are normal.

---

## Test before exposing anything

`port-forward` tunnels a local port straight to a pod, bypassing the Service,
the Ingress and the load balancer entirely. It is the fastest way to tell
"my app is broken" apart from "my ingress is misconfigured".

```bash
# Against the Service (goes through Service routing, not the Ingress)
kubectl -n trpctodo port-forward svc/trpctodo-app 3000:80
curl http://localhost:3000/api/health

# Against one specific pod, when you suspect only some pods are bad
kubectl -n trpctodo port-forward pod/trpctodo-app-xxxxx 3000:3000
```

WebSockets work over `port-forward`, so subscriptions can be tested this way
too — which is exactly how you confirm that a subscription failure in the
browser is the Ingress timeout described in `ingress.yaml` and not the app.

Reaching Postgres directly, for `psql` or a one-off Prisma command:

```bash
kubectl -n trpctodo port-forward svc/postgres 5432:5432
# then, in another shell:
DATABASE_URL='postgresql://trpctodo:REAL_PASSWORD@localhost:5432/trpctodo?schema=public' npx prisma studio
```

---

## ⚠️ What breaks at 2 replicas

The manifests run 2 replicas because the exercise asks for it. Three features
of this app keep state in one process's memory and will misbehave — worth
understanding, because "it works on one pod" is the classic way a design flaw
survives to production.

| Feature | Symptom above 1 replica | Real fix |
|---|---|---|
| GraphQL subscriptions | Live comments arrive "sometimes" — only when the WebSocket and the mutation land on the same pod. The PubSub in `src/server/graphql/team/pubsub.ts` is in-memory. | A shared broker: `graphql-redis-subscriptions` |
| AI Assistant conversations | `Unknown conversation` on a follow-up. `src/server/agent/loop.ts` keeps them in a `Map` on `globalThis`. | Move the store to Postgres or Redis |
| Uploaded voice messages | 404 when the request lands on a different pod; lost entirely on restart. `src/server/storage.ts` writes to the pod's own filesystem. | Object storage (GCS) — which is what that file's comments already describe |

`sessionAffinity: ClientIP` in `app-service.yaml` mitigates the first two by
pinning a client to a pod. It is a band-aid: it breaks whenever a pod is
replaced, distributes load unevenly, collapses behind a shared NAT, and does
nothing for uploaded files.

**To demo this honestly on one pod**, scale down and skip the HPA:

```bash
kubectl -n trpctodo scale deployment/trpctodo-app --replicas=1
kubectl -n trpctodo delete hpa trpctodo-app
```

---

## Things deliberately left out

Not oversights — each is a real production requirement, omitted to keep the core
objects legible.

- **NetworkPolicy.** By default every pod in the cluster can reach Postgres.
  In production, restrict ingress to it to the app's pods only.
- **PodDisruptionBudget.** Without one, a node drain can evict every app pod at
  once. `minAvailable: 1` would prevent that.
- **Managed Postgres.** This StatefulSet is a single pod: no replication, no
  failover, no backups, no point-in-time recovery. On GKE the real answer is
  Cloud SQL via the Auth Proxy sidecar or a Private IP.
- **Workload Identity.** The correct way to give pods access to Google Cloud
  APIs without static keys. It does not help with `ANTHROPIC_API_KEY`, which is
  a third-party credential.
- **Resource quotas, monitoring, alerting, log aggregation, a real CI/CD
  pipeline.**
