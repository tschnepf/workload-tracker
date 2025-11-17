# Integrations Secret Key Rotation

MultiFernet allows us to rotate the encryption key used for OAuth tokens without losing access to existing secrets. Follow this runbook during a planned maintenance window:

1. **Generate a new key locally**
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
   Store the output temporarily in a secure scratchpad.

2. **Add the new key to the rotation list**
   - Navigate to Settings → Integrations Hub.
   - Use the “Generate key” button if you prefer, or paste the key created above into the secret-key form.
   - Click **Save Key**. MultiFernet now keeps the previous keys in the keyring so existing secrets are still decryptable.

3. **Verify decrypt/encrypt paths**
   - Trigger a lightweight integration action (e.g., refresh provider catalog) to confirm existing tokens still decrypt.
   - Perform a benign re-auth or create a sandbox connection so the newest secrets are written with the latest key ID.

4. **Prune retired keys**
   - After all workers have reloaded (Celery + web pods), confirm no logs contain “invalid token” warnings.
   - Once confident, edit the secret-key form again and remove any obsolete keys (leave the newest + the most recent “old” key as a fallback).

5. **Document the rotation**
   - Add an entry to your ops journal noting when rotation occurred and which keys were removed.

If the UI is unavailable, the same rotation can be performed via the API: `POST /api/integrations/secret-key/` with `{ "secretKey": "<base64>" }`.
