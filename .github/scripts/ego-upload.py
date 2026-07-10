#!/usr/bin/env python3
"""Best-effort upload of the packed extension zip to extensions.gnome.org (EGO).

IMPORTANT: extensions.gnome.org has **no official upload API**. This script
drives the website's own login + upload forms, exactly as the browser does. A
successful POST only submits the new version into GNOME's **manual review
queue** — it does not publish anything. A human reviewer approves it later.

Because it depends on the (unversioned, unstable) website HTML, the Release
workflow runs it with `continue-on-error: true`: the GitHub Release is the
reliable artifact, and this step is a convenience. If EGO changes its forms this
script may need updating, or you fall back to uploading the zip by hand at
https://extensions.gnome.org/upload/.

Credentials come from the environment (GitHub secrets):
  EGO_USERNAME  EGO account username or email
  EGO_PASSWORD  EGO account password

Usage: ego-upload.py <path-to.shell-extension.zip>

See ../../docs/release.md.
"""

import os
import re
import sys
import uuid
import http.cookiejar
import urllib.request
import urllib.parse

BASE = "https://extensions.gnome.org"
LOGIN_URL = f"{BASE}/accounts/login/"
UPLOAD_URL = f"{BASE}/upload/"


def _csrf_from_html(html: str) -> str:
    m = re.search(r'name=["\']csrfmiddlewaretoken["\']\s+value=["\']([^"\']+)', html)
    return m.group(1) if m else ""


def _csrf_from_jar(jar) -> str:
    for c in jar:
        if c.name == "csrftoken":
            return c.value
    return ""


def _open(opener, url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data else "GET")
    req.add_header("User-Agent", "gnome-widget-panel-release/1.0")
    return opener.open(req, timeout=60)


def _multipart(fields, file_field, file_name, file_bytes):
    boundary = f"----gwp{uuid.uuid4().hex}"
    parts = []
    for name, value in fields.items():
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        parts.append(f"{value}\r\n".encode())
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{file_name}"\r\n'.encode()
    )
    parts.append(b"Content-Type: application/zip\r\n\r\n")
    parts.append(file_bytes)
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    return body, f"multipart/form-data; boundary={boundary}"


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: ego-upload.py <zip>", file=sys.stderr)
        return 2
    zip_path = sys.argv[1]

    username = os.environ.get("EGO_USERNAME", "")
    password = os.environ.get("EGO_PASSWORD", "")
    if not username or not password:
        print("EGO_USERNAME / EGO_PASSWORD not set; skipping EGO upload.", file=sys.stderr)
        return 0

    with open(zip_path, "rb") as fh:
        file_bytes = fh.read()

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    # 1) Fetch the login page for a CSRF token + cookie.
    login_html = _open(opener, LOGIN_URL).read().decode("utf-8", "replace")
    csrf = _csrf_from_html(login_html) or _csrf_from_jar(jar)

    # 2) Submit the login form (django-allauth field names: login/password).
    login_data = urllib.parse.urlencode(
        {"csrfmiddlewaretoken": csrf, "login": username, "password": password}
    ).encode()
    resp = _open(
        opener,
        LOGIN_URL,
        data=login_data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": LOGIN_URL,
        },
    )
    resp.read()

    # 3) Fetch the upload page (confirms the session and gives a fresh CSRF).
    upload_html = _open(opener, UPLOAD_URL).read().decode("utf-8", "replace")
    if "login" in resp.geturl() or "csrfmiddlewaretoken" not in upload_html:
        print("EGO login appears to have failed; skipping upload.", file=sys.stderr)
        return 0
    csrf = _csrf_from_html(upload_html) or _csrf_from_jar(jar)

    # 4) POST the zip with the compliance checkboxes ticked.
    fields = {
        "csrfmiddlewaretoken": csrf,
        "shell_license_compliant": "on",
        "tos_compliant": "on",
        "gplv2_compliant": "on",
    }
    body, content_type = _multipart(
        fields, "source", os.path.basename(zip_path), file_bytes
    )
    result = _open(
        opener,
        UPLOAD_URL,
        data=body,
        headers={"Content-Type": content_type, "Referer": UPLOAD_URL},
    )
    final_url = result.geturl()
    print(f"EGO upload submitted; response URL: {final_url}")
    print("Note: the new version now awaits GNOME's manual review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
