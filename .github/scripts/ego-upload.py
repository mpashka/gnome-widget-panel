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

See ../../docs/process/release.md.
"""

import json
import os
import re
import sys
import uuid
import http.cookiejar
import urllib.error
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
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv[1:]
    if len(args) != 1:
        print("Usage: ego-upload.py [--dry-run] <zip>", file=sys.stderr)
        return 2
    zip_path = args[0]

    # EGO_USERNAME is the workflow secret; EGO_LOGIN is what a developer's
    # ~/.profile tends to export. Accept either.
    username = os.environ.get("EGO_USERNAME") or os.environ.get("EGO_LOGIN") or ""
    password = os.environ.get("EGO_PASSWORD", "")
    if not username or not password:
        print(
            "EGO_USERNAME (or EGO_LOGIN) / EGO_PASSWORD not set; skipping EGO upload.",
            file=sys.stderr,
        )
        return 0

    with open(zip_path, "rb") as fh:
        file_bytes = fh.read()

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    # 1) Fetch the login page for a CSRF token + cookie.
    login_html = _open(opener, LOGIN_URL).read().decode("utf-8", "replace")
    csrf = _csrf_from_html(login_html) or _csrf_from_jar(jar)

    # 2) Submit the login form. The field is `username`, not the django-allauth
    # `login` this script used to send: with the wrong name the POST simply did
    # not authenticate, the upload was skipped, and — because the failure
    # returned 0 — the release workflow reported a green "Submit to
    # extensions.gnome.org" step for two releases while uploading nothing.
    login_data = urllib.parse.urlencode(
        {
            "csrfmiddlewaretoken": csrf,
            "username": username,
            "password": password,
            "next": "/",
        }
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

    # 3) Fetch the upload page. It no longer *is* the upload endpoint: EGO
    # serves a JS uploader whose target is announced in the page as
    # `data-upload-api-url` (currently /api/v1/extensions). POSTing the form to
    # /upload/ now answers 405, so read the endpoint from the page instead of
    # hardcoding it — that is what the browser does.
    upload_html = _open(opener, UPLOAD_URL).read().decode("utf-8", "replace")
    if "login" in resp.geturl() or "csrfmiddlewaretoken" not in upload_html:
        # Non-zero on purpose. The workflow runs this step with
        # `continue-on-error: true`, so failing here still lets the release
        # finish — but it shows up as a failed step instead of a green lie.
        print("EGO login failed; the upload did NOT happen.", file=sys.stderr)
        return 1

    api = re.search(r'data-upload-api-url="([^"]+)"', upload_html)
    if not api:
        print(
            "Could not find the upload API URL on /upload/; EGO changed its page.",
            file=sys.stderr,
        )
        return 1
    api_url = urllib.parse.urljoin(BASE, api.group(1))
    csrf = _csrf_from_html(upload_html) or _csrf_from_jar(jar)

    if dry_run:
        # Everything but the POST: proves the credentials, the session and the
        # endpoint without putting a duplicate submission in the review queue.
        print(f"dry run: logged in, upload endpoint is {api_url}")
        return 0

    # 4) POST the zip with the compliance boxes ticked. The API takes the CSRF
    # token in a header, not as a form field.
    body, content_type = _multipart(
        {"shell_license_compliant": "true", "tos_compliant": "true"},
        "source",
        os.path.basename(zip_path),
        file_bytes,
    )
    try:
        result = _open(
            opener,
            api_url,
            data=body,
            headers={
                "Content-Type": content_type,
                "Referer": UPLOAD_URL,
                "X-CSRFToken": csrf,
                "Accept": "application/json",
            },
        )
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        print(f"EGO upload rejected: HTTP {e.code}\n{detail}", file=sys.stderr)
        return 1

    payload = result.read().decode("utf-8", "replace")
    try:
        info = json.loads(payload)
        print(
            f"EGO upload accepted: {info.get('extension')} "
            f"{info.get('version_name')} (submission {info.get('version')})"
        )
    except ValueError:
        print(f"EGO upload returned HTTP {result.status}: {payload[:300]}")
    print("The new version now awaits GNOME's manual review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
