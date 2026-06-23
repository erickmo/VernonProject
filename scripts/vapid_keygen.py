#!/usr/bin/env python3
"""Generate a VAPID keypair for Vernon Web Push.

Emits the two values Vernon's code reads from site_config.json:
  - vapid_public_key  : base64url raw uncompressed P-256 point (65 bytes) —
                        used by the browser as applicationServerKey.
  - vapid_private_key : base64url raw private scalar (32 bytes) —
                        passed straight to pywebpush's webpush(vapid_private_key=...).

Run with the bench python (cryptography is already installed there):
  cd /home/frappe/frappe-bench && ./env/bin/python vapid_keygen.py

The private key is a SECRET. Store it only in the site_config.json (server-only,
git-ignored). Do not paste it into chats, commits, or tickets.
"""
import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def main() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    priv_raw = key.private_numbers().private_value.to_bytes(32, "big")
    pub_raw = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )  # 65 bytes, 0x04 || X || Y
    assert len(priv_raw) == 32 and len(pub_raw) == 65 and pub_raw[0] == 0x04
    print("vapid_public_key  =", b64url(pub_raw))
    print("vapid_private_key =", b64url(priv_raw))


if __name__ == "__main__":
    main()
