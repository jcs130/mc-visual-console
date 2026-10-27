# Original custom arm rigs and observed ground queries

2026-10-27 candidate; a source commit does not update a consuming website.

Some original YSM 2.4.1 models use a first-person arm hierarchy other than the reviewed two-root `LeftArm`/`RightArm` convention. `createNativePaperAppearanceActor` previously rejected the entire character with `PAPER_FIRST_PERSON_ARM_RIG_UNSUPPORTED`, even when the independent main rig and animations were valid. It now retains that original third-person actor. Unsupported first-person arms remain unavailable, with `assetInfo.firstPersonArmsAvailable=false` and `firstPersonArmReason`; it does not substitute a skin or arm model. Invalid JSON and geometry still fail explicitly.

The shared original animation evaluator also supplies `query.is_on_ground` from an actual observed boolean. Missing input remains missing; it is not replaced with a guessed ground state. Existing transition blending remains intact.

Validation: the optional-arm regression and missing/false/true ground-query regression pass. After integrating upstream projectile/shield/bind-pose updates, fifty-eight relevant tests pass with the original Cormy, NEKO and Kirito resource fixtures, including movement/attack/eat/drink animation sampling, held-item transforms and observed shield poses; thirteen unrelated bundled-fixture tests remain conditional without their catalogue. A separate real WebGL review of twelve acquired original bundles found eight with valid idle/walk/run; individual missing attack/eating tracks and unsupported first-person rigs remain explicitly partial. This is synthetic observed-state testing, not Java pixel parity or a production deployment.

No third-party textures, geometry, animation archives or private captures are included here. Consumers should keep original source hashes and author notices, request only a selected appearance, and publish a matching renderer build before exposing choices that require this fix.
