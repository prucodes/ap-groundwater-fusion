# TLS And Download Reproducibility

## Preferred Download Mode

NASA/NDMC GRACE-DA files should be downloaded with normal verified TLS whenever possible. Verified TLS confirms that Python can validate the server certificate chain for the HTTPS download.

The default behavior of `scripts/download_nasa_grace_da.py` uses normal certificate verification and does not silently fall back to insecure TLS.

## Fixing Local Certificate Problems

On some local Mac/Python installations, Python may fail with `CERTIFICATE_VERIFY_FAILED` even when a browser or `curl` can reach the same URL.

Recommended fixes:

1. Run the Python certificate installer included with python.org macOS builds, if available.
2. Upgrade local certificate packages such as `certifi`.
3. Confirm the environment can open the NASA URL with verified TLS before relying on a production download.

## Explicit Local Fallback

The downloader supports:

```bash
python scripts/download_nasa_grace_da.py --allow-insecure-tls
```

Use this only as a local reproducibility fallback when normal verification fails and the source URL has been independently checked. This flag retries with unverified TLS only after normal TLS verification fails.

When this fallback is used, the download manifest records:

- `tls_verified=false`
- `tls_fallback_reason=CERTIFICATE_VERIFY_FAILED`

## File Integrity Tracking

Every downloaded file is recorded with:

- local path
- source URL
- fetch date
- file size
- SHA-256 hash
- data label
- official flag
- TLS verification status

SHA-256 hashes support file integrity tracking and make later review easier, but they do not replace verified TLS.

