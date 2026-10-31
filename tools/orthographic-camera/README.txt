Experimental orthographic camera companion for the isolated Fabric 1.21.1 lab.

This is candidate source, not the production NativeDirector, and not installed by
the package's default entry point. It does not connect a game client, run a model,
execute game commands or activate multiplayer control. The two Java files compile
against a matching Minecraft intermediary cache, Fabric API and the official
OrthoCamera 0.1.9+1.21 JAR. Preserve the original OrthoCamera MIT license/JAR.

The local lab build-helper.mjs compiles these sources into a separately named
candidate JAR. Never overwrite a running or production client as a build step.
Use a client-only Fabric entrypoint local.orthopreview.OrthoPreviewClient and the
client Mixin local.orthopreview.mixin.PreviewMouseMixin (JAVA_21, defaultRequire 1).
Release/package tooling and clean-client runtime acceptance remain pending.

Bound camera requests in ortho-preview/request.json can use schema
mcvisual.camera/v1, id, lease, scope, subjectUuid, issuedAt, expiresAt (<=10s),
enabled, scale (3..32), yaw (-180..180), pitch (10..85), transitionMs (0..2500),
autoAvoid, hideHud. The matching local scope/UUID come from fresh status.json.
Only the explicit singleplayer lab accepts legacy unversioned preview requests.
Cancellation records bind the original id/lease/scope/subject, and prevent a
delayed old request from starting after its cancellation.

Same-projection parameters ease along the shortest yaw path. Projection changes
are labelled cuts. A rendered frame after settling is needed for applied; an
accepted file or elapsed timer is not rendered proof.

The prototype probes five body points against native VISUAL block shapes in
loaded chunks. Unknown terrain stays unknown. Persistent obstruction may choose
among bounded azimuth/elevation candidates, with a cooldown and smooth motion.
This is block occlusion estimation, not precise YSM mesh coverage or entity
occlusion. It does not solve room topology, multi-floor cutaways, shader-compatible
outlines or foreground transparency. Those remain separate backend capabilities.

See ../../docs/broadcast-camera-plan-20261101.txt for the overall design and exact
source/build/runtime/production acceptance boundaries.
