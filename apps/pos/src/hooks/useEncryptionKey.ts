let encryptionKey: CryptoKey | null = null

export function getEncryptionKey(): CryptoKey | null {
  return encryptionKey
}

export function setEncryptionKey(key: CryptoKey | null): void {
  encryptionKey = key
}
