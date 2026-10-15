const SIGNATURE=/^[a-f0-9]{64}:[a-f0-9]{64}$/
export function nativeViewerBuildSignature(sourceSha256,manifestSha256){
  const value=sourceSha256+':'+manifestSha256
  if(!SIGNATURE.test(value))throw Error('NATIVE_VIEWER_BUILD_INVALID')
  return value
}
export function withNativeViewerBuild(html,signature){
  if(!SIGNATURE.test(signature)||!/<head\b[^>]*>/i.test(html))throw Error('NATIVE_VIEWER_BUILD_PAGE_INVALID')
  return html.replace(/<head\b[^>]*>/i,head=>head+'<meta name="native-viewer-build" content="'+signature+'">')
}
// Reconnecting EventSource does not replace the page's loaded JS, CSS or asset
// reader. Reload this same route once when its checked renderer/asset pair
// changes; a worker-only reconnect to the same build does nothing.
export function createNativeViewerBuildGuard(signature,reload){
  let current=SIGNATURE.test(signature??'')?signature:null,reloading=false
  return incoming=>{
    if(!SIGNATURE.test(incoming??''))return false
    if(current===null){current=incoming;return false}
    if(incoming!==current&&!reloading){reloading=true;reload()}
    return reloading
  }
}
