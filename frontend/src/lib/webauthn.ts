// WebAuthn passkey ("fingerprint") glue. The browser only ferries bytes —
// all crypto verification happens server-side (py_webauthn). This module does
// the base64url <-> ArrayBuffer encoding the WebAuthn JS API needs, wraps
// navigator.credentials, and orchestrates enroll / login against the backend.
//
// No extra JS dependency: the security boundary is the server verify, so the
// client glue is pure encoding + the native API.

import { passkeyApi, passkeyLoginBegin, passkeyLoginComplete, reportPasskeyClientError } from '@/lib/api'

const ENROLLED_HINT_KEY = 'vernon-passkey-enrolled'

// --- base64url <-> bytes -----------------------------------------------------
function b64urlToBuf(value: string): ArrayBuffer {
  const pad = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// --- capability + helpers ----------------------------------------------------
export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!passkeySupported()) return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function passkeyEnrolledHint(): boolean {
  try {
    return window.localStorage.getItem(ENROLLED_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function setPasskeyEnrolledHint(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(ENROLLED_HINT_KEY, '1')
    else window.localStorage.removeItem(ENROLLED_HINT_KEY)
  } catch {
    /* ignore */
  }
}

// User cancelled / dismissed the OS prompt — treat as a no-op, not an error.
// NOTE: NotAllowedError is ambiguous (genuine cancel OR a real failure such as
// timeout / no authenticator), so only AbortError + our explicit 'cancelled'
// are treated as silent. Real NotAllowedError surfaces via describePasskeyError.
export function isPasskeyCancel(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError') ||
    (e instanceof Error && e.message === 'cancelled')
  )
}

// Exact, on-screen diagnostic string (DOMException name + message). Visible on
// mobile where there is no dev console.
export function describePasskeyError(e: unknown): string {
  if (e instanceof DOMException) return `${e.name}: ${e.message}`
  if (e instanceof Error) return e.message
  return String(e)
}

export function defaultDeviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android device'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Linux/.test(ua)) return 'Linux device'
  return 'This device'
}

// --- native credential calls (server JSON <-> WebAuthn API) ------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
async function createCredential(options: any): Promise<any> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    user: { ...options.user, id: b64urlToBuf(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({
      ...c,
      id: b64urlToBuf(c.id),
    })),
  }
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null
  if (!cred) throw new Error('cancelled')
  const res = cred.response as AuthenticatorAttestationResponse
  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64url(res.clientDataJSON),
      attestationObject: bufToB64url(res.attestationObject),
      transports: typeof res.getTransports === 'function' ? res.getTransports() : [],
    },
    clientExtensionResults: cred.getClientExtensionResults(),
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
  }
}

async function getCredential(options: any): Promise<any> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((c: any) => ({
      ...c,
      id: b64urlToBuf(c.id),
    })),
  }
  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null
  if (!cred) throw new Error('cancelled')
  const res = cred.response as AuthenticatorAssertionResponse
  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64url(res.clientDataJSON),
      authenticatorData: bufToB64url(res.authenticatorData),
      signature: bufToB64url(res.signature),
      userHandle: res.userHandle ? bufToB64url(res.userHandle) : undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- orchestration -----------------------------------------------------------
function reportPasskeyError(context: string, e: unknown): void {
  const name = e instanceof Error ? e.name : 'Unknown'
  const message = e instanceof Error ? e.message : String(e)
  reportPasskeyClientError(`[${context}] ${name}: ${message} | secure=${window.isSecureContext} | UA: ${navigator.userAgent}`)
}

export async function enrollPasskey(label: string): Promise<{ name: string; label: string }> {
  try {
    const options = await passkeyApi.registerBegin()
    const credential = await createCredential(options)
    const result = await passkeyApi.registerComplete(credential, label)
    setPasskeyEnrolledHint(true)
    return { name: result.name, label: result.label }
  } catch (e) {
    reportPasskeyError('enroll', e)
    throw e
  }
}

export async function loginWithPasskey(): Promise<void> {
  try {
    const { _handle, ...options } = await passkeyLoginBegin()
    const credential = await getCredential(options)
    await passkeyLoginComplete(credential, _handle)
  } catch (e) {
    reportPasskeyError('login', e)
    throw e
  }
}
