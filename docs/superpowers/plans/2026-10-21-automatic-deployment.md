# Automatic Deployment Implementation Plan

> **For agentic workers:** Use subagent-driven development for the isolated Python publisher and its tests, with controller-owned Actions, packaging and server setup. Review spec compliance before code quality. The user approved the design and authorized complete configuration plus a real master-push deployment.

**Goal:** Every master push builds on GitHub and safely publishes only this website on port 8550, preserving guestbook state.

**Architecture:** A hosted runner creates one validated artifact containing a static-site tarball and a tagged Linux Docker archive. A forced SSH command invokes a root-owned Python publisher against fixed existing server configuration, with SQLite backup, a file lock, bounded archive validation and exact-image rollback. Runtime secrets remain only on the server.

**Tech Stack:** GitHub Actions, official SHA-pinned checkout/setup-node, Node 24/pnpm 11, Python 3.10 standard library, OpenSSH, existing Docker/legacy Compose.

## Task 1 — Publisher contract, tests and implementation

Files: `deployment/publisher.py`, `tests/test_deployment.py`.

- [x] Write tests before implementation for `parse_command`, `unpack_bundle`, `validate_image_archive`, safe site extraction and failed-rollout recovery. Run `python -m unittest discover -s tests -p test_deployment.py -v`; observe missing publisher failure.
- [x] Protocol: `check`, or `deploy <40-lowercase-hex-commit> <64-lowercase-hex-bundle-digest>`. Reject extra arguments and all other commands before side effects.
- [x] Accept a bounded uncompressed outer tar containing exactly `site.tar.gz` and `image.tar.gz`. Verify input digest; reject traversal, symlinks, duplicate names, excessive sizes/counts. Image manifest must name only `mystarry-blog:<commit>` and its image config must have matching OCI revision and non-root `node`/1000 user.
- [x] Use fixed `/home/ubuntu/astro-bento-portfolio`, `astro-bento`, app/web names and 8550. No artifact Compose/Nginx/env/scripts, no database copy/restore, no global Docker operations.
- [x] Back up live SQLite with existing backup CLI before switching; check backup integrity. Preserve old current and actual immutable image ID, not just a mutable tag. Under a file lock, load image, switch static release and update only PORTFOLIO_IMAGE, then recreate only web/app.
- [x] On failure, restore old image ID/current and recreate only web/app. Never roll database back. Verify deployed static commit, pages/API and health; compare other containers and original Nginx fingerprint.
- [x] Run real archive/unit tests and independent security review; resolve findings before server installation.

## Task 2 — CI packaging, workflow and documentation

Files: `deployment/package_release.py`, `.github/workflows/deploy.yml`, `deployment/install-publisher.sh`, `deployment/README.md`.

- [x] Package `dist/client/` as site.tar.gz and `docker save mystarry-blog:$GITHUB_SHA` as image.tar.gz; no source .env/database. Generate `public/deployment.json` from the commit before build.
- [x] Actions trigger push master and workflow_dispatch, additionally require `github.ref == refs/heads/master`. Set contents:read, concurrency production/cancel-in-progress:false; run tests, Python tests, check, build and Docker build with revision label. Pin verified official action SHAs.
- [x] Only deployment step receives DEPLOY_SSH_KEY; use temporary key file mode600, pinned known_hosts, strict host validation, no agent/forwarding, bounded connect/keepalive settings. Stream artifact to forced `deploy` command; report public URL and SHA.
- [x] Install fixed root-owned publisher and gateway wrapper. Dedicated `mystarry-deploy` user has a single restricted authorized key and sudo permission only for publisher, no docker-group membership. Retain original SSH access and other services.
- [x] Document PUBLIC_SITE_URL/DEPLOY_HOST/DEPLOY_PORT/DEPLOY_USER/DEPLOY_KNOWN_HOSTS variables, DEPLOY_SSH_KEY secret, manual retries, rollback, updating trusted publisher and domain migration.

## Task 3 — Configure, exercise real push, verify preservation

- [x] Generate ignored local key; install public key and publisher over existing authenticated SSH; test forced check and rejected shell/forwarding. Store private key using `gh secret set ... --body-file` or stdin, never print it. Configure repository variables through structured gh arguments/files.
- [x] Capture other containers/Nginx fingerprint and existing DB logical snapshot; create a temporary acceptance marker if needed without deleting or changing existing user data.
- [ ] Run Node/Python tests, typecheck/build and workflow validation; commit and push to master under the user's explicit auto-deploy authorization.
- [ ] Follow actual Actions run to completion; fix and retry if necessary. Verify public deployment.json equals pushed commit, healthy app/web, public pages/API, marker persistence, original records unchanged, original containers/start times/Nginx unchanged. Delete only our temporary marker through admin API.
- [ ] Update plan and verification record, ensure clean Git and no secret leakage, report workflow link, trigger behavior and data-preservation result.
