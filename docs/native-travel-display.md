# Travel display preferences

NeoForge native director 0.1.38 and observer 0.1.11 keep the target's read-only inventory from covering a journey indefinitely. The display closes after six seconds only when fresh target coordinates show eight blocks of displacement, motion is still recent and the operator has not interacted for four seconds. Camera movement is not target movement. Teleports reset the baseline. `P` pins the panel; `E` and Escape still close it. This does not close or operate the Agent's actual inventory.

With `orthographicPreference` enabled, `NativeCameraSequence` prefers a safe orthographic view during observed travel and reports `holding_preferred_travel` while retaining it. Hosts should suppress ordinary overview, conversation and movement reframes in this phase; operator choices and genuine action/safety changes remain authoritative. Proposals expose `sequence.preference = "orthographic_travel"`; `nativeCameraCandidates` preserves this choice when constructing model alternatives.

The preference does not override unknown/stale geometry, GUI, manual stops, clipping or unsafe camera paths. A stationary or combat scene may use another composition. Java build/consumer checks and shared policy tests establish contracts; actual loaded versions and in-world frames must be verified separately by the host.
