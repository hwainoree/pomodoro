# Pomodoro deployment

Live URL: https://pomodoro.hn.yaaha.net
Namespace: `hwainoree`; app resources named `pomodoro` / `pomodoro-http`.

## Code and container

Source is in `/opt/data/apps/hwainoree/pomodoro/src`; runtime output in `dist`. `/workspace/hwainoree` is read/write-mounted but currently not writable by Hermes: UID/GID 10000 lacks directory group 1003 (directory owner 1000:1003, mode 0775). Source was therefore created under Hermes data instead. No host ownership or permissions were changed. An administrator can grant a narrow ACL or add group 1003 to the Hermes pod's supplementary groups, preserving existing groups and securityContext fields.

No custom image was built or pushed. Kubernetes pulls `nginx:1.28.0-alpine` from Docker Hub and caches it in the node's container runtime. App HTML/CSS/JS is stored in a content-hashed ConfigMap in hwainoree and mounted into Nginx. A second ConfigMap holds Nginx configuration. These app/config files contain no credentials. Kubernetes controller-managed ReplicaSets and Pods run the Deployment.

## Authentication and scope

Hermes runs in namespace `hermes`. Its rotating credentials are mounted at `/var/run/kubernetes/serviceaccount/token` with `ca.crt` alongside. `/opt/data/kubernetes/hwainoree.kubeconfig` references the token via `tokenFile`; it does not copy the token. `/opt/data/bin/kubectl` is a checksum-verified client matching the observed server version, v1.35.6.

SelfSubjectAccessReviews verified creation of Deployments, ConfigMaps and Ingresses and reading pods in `hwainoree`; creating Deployments in `hermes` was denied. This is a focused permissions check, not a complete RBAC audit. No cluster-scoped objects, RBAC, namespaces, or secrets were changed.

## Update

```bash
cd /opt/data/apps/hwainoree/pomodoro
npm test
npm run build
/opt/data/bin/kubectl kustomize . > rendered.yaml
/opt/data/bin/kubectl --kubeconfig=/opt/data/kubernetes/hwainoree.kubeconfig apply --dry-run=server -f rendered.yaml
/opt/data/bin/kubectl --kubeconfig=/opt/data/kubernetes/hwainoree.kubeconfig apply -f rendered.yaml
/opt/data/bin/kubectl --kubeconfig=/opt/data/kubernetes/hwainoree.kubeconfig -n hwainoree rollout status deployment/pomodoro --timeout=120s
```

Review rendered.yaml before applying: every resource must be in hwainoree and belong to this app. Old content ConfigMaps are retained for rollback; do not prune shared resources.

## Runtime

One Nginx replica, port 8080, ClusterIP Service port 80. Non-root UID 101, read-only root filesystem, no mounted API token, dropped capabilities, resource limits and HTTP probes. Built files are read-only mounts; only /tmp is writable.

Traefik class `traefik` routes the wildcard-backed hostname, using `web` / `websecure` and ACME resolver `myresolver`, following the user's example. HTTPS was verified with a trusted certificate. A separate HTTP ingress is also present (no HTTP-to-HTTPS redirect), matching the example. Timer state is browser-local. Plain HTTP and HTTPS have separate localStorage origins, so use HTTPS consistently.

Python 3.13's strict X509 validation rejected the legacy MicroK8s CA's missing key-usage extension. The permission probe used a compatibility context that still verified the mounted CA and hostname; kubectl worked with the mounted CA without a TLS bypass.

Verification: 19 Node tests, server-side dry-run, successful rollout, HTTPS GET of current app.js, and 10 deployed-browser checks without JavaScript/CSP errors. The original example remained healthy.
