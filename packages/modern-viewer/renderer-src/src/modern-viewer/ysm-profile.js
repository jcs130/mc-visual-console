// Independently reviewed producer/version/artifact tuples. Shared with Node;
// no filesystem access or guessed version aliases.
export const PAPER_YSM_PROFILES = Object.freeze({
  freesia_worker: Object.freeze({version:'2.4.1',protocol:'2.4.0',jar:'ec51cfae84d219a45fac5098a31bfe980bcb7c2d8b413e8fffbd05a411a85680'}),
  ysm_native_backend: Object.freeze({version:'2.6.5',protocol:'2.6.0',jar:'b285c73d4ec010d9a9be3c53c1bee890cf269645be5f1bcf1c27a2e8e82807cb'})
})
export const supportedYsmBundleVersion = version => version === '2.4.1' || version === '2.6.5'
export function matchesPaperYsmProfile(row) {
  const profile = PAPER_YSM_PROFILES[row?.source]
  return !!profile && row.ysmVersion === profile.version && row.protocolVersion === profile.protocol && row.jarSha256 === profile.jar
}
