#!/usr/bin/env python3
"""Generate a VAPID keypair for Vernon Web Push.

Emits the two values Vernon's code reads from site_config.json:
  - vapid_public_key  : base64url raw uncompressed P-256 point (65 bytes) —
                        used by the browser as applicationServerKey.
  - vapid_private_key : base64url raw private scalar (32 bytes) —
                        passed straight to pywebpush's webpush(vapid_private_key=...).

Two modes:

  # Print the pair (copy into config yourself):
  cd /home/frappe/frappe-bench && ./env/bin/python apps/vernon_project/scripts/vapid_keygen.py

  # Write the pair straight into a site's config (recommended — avoids the
  # `bench set-config` pitfall where a base64url key starting with '-' is
  # misparsed as a CLI flag):
  cd /home/frappe/frappe-bench && ./env/bin/python apps/vernon_project/scripts/vapid_keygen.py \
      --site project.vernon.id --subject mailto:mo@intinusa.id

The private key is a SECRET. With --site it is written only to the server-only,
git-ignored site_config.json and never printed. Do not paste it elsewhere.
"""
import argparse
import base64
import json
import os
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def generate() -> "tuple[str, str]":
    key = ec.generate_private_key(ec.SECP256R1())
    priv_raw = key.private_numbers().private_value.to_bytes(32, "big")
    pub_raw = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )  # 65 bytes, 0x04 || X || Y
    assert len(priv_raw) == 32 and len(pub_raw) == 65 and pub_raw[0] == 0x04
    return b64url(pub_raw), b64url(priv_raw)


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate a VAPID keypair for Vernon Web Push.")
    ap.add_argument("--site", help="Write the pair into sites/<site>/site_config.json instead of printing it.")
    ap.add_argument("--subject", default="mailto:admin@example.com",
                    help="vapid_subject (mailto: or https: URL). Used only with --site.")
    ap.add_argument("--bench-root", default=os.getcwd(),
                    help="Bench root that contains sites/ (default: current dir).")
    args = ap.parse_args()

    pub, priv = generate()

    if not args.site:
        print("vapid_public_key  =", pub)
        print("vapid_private_key =", priv)
        return

    cfg_path = os.path.join(args.bench_root, "sites", args.site, "site_config.json")
    with open(cfg_path) as fh:
        conf = json.load(fh)
    conf["vapid_public_key"] = pub
    conf["vapid_private_key"] = priv
    conf["vapid_subject"] = args.subject
    with open(cfg_path, "w") as fh:
        json.dump(conf, fh, indent=1)
    print(f"Wrote VAPID keys to {cfg_path}")
    print("vapid_public_key  =", pub)
    print("vapid_private_key =  (set, hidden)")
    print("vapid_subject     =", args.subject)


if __name__ == "__main__":
    main()
