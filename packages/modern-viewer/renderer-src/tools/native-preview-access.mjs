import { isIP } from 'node:net'

// LAN is an explicit private /24 and one Host header, never arbitrary origins.
export function nativePreviewAccess (lanAddress = null) {
  let prefix = null
  if (lanAddress !== null) {
    if (typeof lanAddress !== 'string' || isIP(lanAddress) !== 4) throw Error('NATIVE_VIEWER_LAN_ADDRESS_INVALID')
    const [a, b, c, d] = lanAddress.split('.').map(Number)
    if (!(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) || d === 0 || d === 255) throw Error('NATIVE_VIEWER_LAN_ADDRESS_INVALID')
    prefix = `${a}.${b}.${c}.`
  }
  return {
    listenHost: lanAddress === null ? '127.0.0.1' : '0.0.0.0',
    allowsRequest (request, port) {
      const peer = (request.socket?.remoteAddress || '').replace(/^::ffff:/i, '')
      if (!(peer === '127.0.0.1' || peer === '::1' || (prefix && isIP(peer) === 4 && peer.startsWith(prefix)))) return false
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, ...(lanAddress ? [`${lanAddress}:${port}`] : [])]
      return hosts.includes(request.headers.host) && (!request.headers.origin || hosts.map(h => `http://${h}`).includes(request.headers.origin))
    }
  }
}
