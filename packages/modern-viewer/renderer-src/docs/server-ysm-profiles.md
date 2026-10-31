# Server YSM appearance profiles

The existing game-connection appearance/asset channels now distinguish two exact profiles:

| Source | YSM | Protocol | Original artifact SHA256 |
| --- | --- | --- | --- |
| `freesia_worker` | 2.4.1 | 2.4.0 | `ec51cfae84d219a45fac5098a31bfe980bcb7c2d8b413e8fffbd05a411a85680` |
| `ysm_native_backend` | 2.6.5 | 2.6.0 | `b285c73d4ec010d9a9be3c53c1bee890cf269645be5f1bcf1c27a2e8e82807cb` |

`server-ysm-profile.js` defines the tuples. A new version label, mixed source/protocol, or unknown artifact is rejected. The native profile is emitted by the optional Youer backend adapter in the server project; it is not an alias for the old Freesia Worker wire protocol.

Metadata still binds to the actual connection's UUID/entity/epoch and expires after 15 seconds. Asset requests remain serialized, bounded and hash-verified; the returned bundle must match both the model and requested YSM version. Host renderability also checks the cached bundle's version. The browser accepts the native tuple and applies only its matching server asset. Explicit user-selected Web overrides keep their existing, separately disclosed behavior.

Native encrypted models can be confirmed without a public geometry export. `YSM_ENCRYPTED_SOURCE_REQUIRED` explains that the original is available in a native client and requires author-provided public source for Web rendering. Disabled and uninitialized attachments are separate unavailable states; no substitute actor or native parity claim is invented.

Validation: 12 host/asset checks and 36 browser appearance, selection and action checks passed, including native acceptance, wrong-profile rejection, native unavailable reasons, preserved real-body binding, asset version mismatch, and unchanged legacy behavior. These are protocol/logic checks, not native-client pixel or full-scene parity. No deployed consumer is updated by this source change; each consumer must freeze matching host/browser files and be verified before switching its production server profile.
