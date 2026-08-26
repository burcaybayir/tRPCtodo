/**
 * HEALTH CHECK — what Kubernetes polls to decide if this pod is alive and ready
 *
 * Deliberately does almost nothing. A health endpoint is not a smoke test:
 * every probe runs on a fixed interval, on every pod, forever. Anything
 * expensive here becomes constant background load, and anything that can fail
 * for a reason unrelated to *this process* becomes a way to kill healthy pods.
 *
 * The classic mistake is querying the database here. Consider what happens when
 * Postgres has a five-second hiccup: every pod's probe fails at once, the
 * kubelet restarts all of them, and the restarts do nothing to fix Postgres —
 * you have turned a brief database blip into a full outage of an app that would
 * otherwise have recovered on its own. A liveness probe should answer "is this
 * process wedged?", not "is the whole system healthy?".
 *
 * (A readiness probe *may* legitimately check a dependency, since failing it
 * only removes the pod from the Service rather than killing it. Even then it is
 * rarely worth it here: with one shared database, a pod that cannot reach
 * Postgres is not usefully different from every other pod. Both probes in
 * k8s/app-deployment.yaml therefore point at this same endpoint.)
 */

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      // Handy when several pods are in rotation: curl the Service a few times
      // and the changing uptime tells you which pod answered.
      uptimeSeconds: Math.round(process.uptime()),
    },
    {
      status: 200,
      // Probe responses must never be cached — a cached 200 would keep
      // reporting health long after the process stopped being healthy.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
