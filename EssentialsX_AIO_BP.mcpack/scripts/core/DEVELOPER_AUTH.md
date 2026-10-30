# Developer password (v1.8.74)

This build restores the fixed developer password requested by the owner. Only its
salted, iterated SHA-256 verifier is stored in `developer-auth.js`. No remote key
source is used; the plaintext password is not embedded in the packs.

The administrator permission check, form, 30-day expiry, permission recheck after
the form, and shared concurrent prompt remain unchanged. Previously issued valid
sessions remain active until their existing expiry.

`node --test tests/developer-auth.test.mjs` checks the authentication flow with
synthetic credentials and the real password hashing code. The fixed password was
also checked against the actual verifier without saving or printing it.
Native Bedrock form interaction and pack import require an in-game check.
