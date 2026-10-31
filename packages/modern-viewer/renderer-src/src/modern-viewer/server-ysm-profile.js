/** Exact source/version/artifact tuples; a version label alone is not compatible. */
export const SERVER_YSM_PROFILES=Object.freeze({
  freesia_worker:Object.freeze({ysmVersion:'2.4.1',protocolVersion:'2.4.0',jarSha256:'ec51cfae84d219a45fac5098a31bfe980bcb7c2d8b413e8fffbd05a411a85680'}),
  ysm_native_backend:Object.freeze({ysmVersion:'2.6.5',protocolVersion:'2.6.0',jarSha256:'b285c73d4ec010d9a9be3c53c1bee890cf269645be5f1bcf1c27a2e8e82807cb'})
});
export function matchesServerYsmProfile(row){
  const profile=Object.hasOwn(SERVER_YSM_PROFILES,row?.source)?SERVER_YSM_PROFILES[row.source]:null;
  return !!profile&&Object.entries(profile).every(([key,value])=>row[key]===value);
}
