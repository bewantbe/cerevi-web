// Client-side gate for unpublished specimens. This is a soft deterrent for
// casual visitors, not real security — the data endpoints stay reachable.

import { ref } from 'vue'

const COOKIE_NAME = 'cerevi_internal_access'
const COOKIE_MAX_AGE_S = 24 * 60 * 60 // 1 day

// SHA-256 of the internal access password ("pa55w0rd"). Override at build
// time with VITE_INTERNAL_ACCESS_PASSWORD_SHA256.
const PASSWORD_SHA256 =
  import.meta.env.VITE_INTERNAL_ACCESS_PASSWORD_SHA256 ||
  '56965e2a1a995c74da500088947af11dfa27951cc350d0b97d0633075969c31b'

const authorized = ref(readCookie())

function readCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split(';')
    .some((part) => part.trim() === `${COOKIE_NAME}=1`)
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function useInternalAccess() {
  async function authorize(password: string): Promise<boolean> {
    if ((await sha256Hex(password)) !== PASSWORD_SHA256) return false
    document.cookie = `${COOKIE_NAME}=1; max-age=${COOKIE_MAX_AGE_S}; path=/; samesite=lax`
    authorized.value = true
    return true
  }

  function isGated(specimen: { published?: boolean } | null | undefined): boolean {
    return specimen?.published === false && !authorized.value
  }

  return { authorized, authorize, isGated }
}
