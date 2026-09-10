/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SHA-256 hex digest of the internal access password for unpublished specimens. */
  readonly VITE_INTERNAL_ACCESS_PASSWORD_SHA256?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
