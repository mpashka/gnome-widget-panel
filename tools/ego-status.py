#!/usr/bin/env python3
"""Report where this extension stands on extensions.gnome.org (EGO).

EGO has no official API, so this uses the two things that do work:

1. **Unauthenticated** — `GET /extension-info/?uuid=<uuid>`. While a version is
   unpublished (never approved, or waiting for review/author) the endpoint
   answers 404. Once the extension is published it answers JSON carrying the
   approved version and the shell-version map. That single fact is the reliable
   "has it been approved yet?" signal, and it needs no credentials.

2. **Authenticated** — with EGO_USERNAME / EGO_PASSWORD it logs in through the
   website's form (the same flow as `.github/scripts/ego-upload.py`) and fetches
   the author's own page for the extension, which is where the review state and
   any reviewer feedback are visible. Reviewer feedback is also emailed to the
   account owner.

Exit codes: 0 published, 10 not published (or still under review), 2 error.
The `--json` output is meant to be diffed between runs by a watcher.

Usage:
    tools/ego-status.py [--uuid UUID] [--json] [--dump-html DIR]

See docs/process/promotion.md.
"""

import argparse
import http.cookiejar
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://extensions.gnome.org"
LOGIN_URL = f"{BASE}/accounts/login/"
DEFAULT_UUID = "gnome-widget-panel@mpashka.github.com"
USER_AGENT = "gnome-widget-panel-status/1.0"
TIMEOUT = 30


def _opener_with_cookies():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)), jar


def _get(opener, url, data=None):
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("User-Agent", USER_AGENT)
    if data:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        req.add_header("Referer", LOGIN_URL)
    return opener.open(req, timeout=TIMEOUT)


def public_state(uuid):
    """(published: bool, payload: dict|None) from the unauthenticated endpoint."""
    opener, _ = _opener_with_cookies()
    url = f"{BASE}/extension-info/?{urllib.parse.urlencode({'uuid': uuid})}"
    try:
        with _get(opener, url) as resp:
            body = resp.read().decode("utf-8", "replace")
        return True, json.loads(body)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, None
        raise


def _csrf(jar):
    for c in jar:
        if c.name == "csrftoken":
            return c.value
    return ""


def author_state(uuid, username, password, dump_dir=None):
    """Log in and return the author-visible page text for this extension.

    UNVERIFIED against a live account: written from the login flow in
    `.github/scripts/ego-upload.py`. Treat a parse failure as "unknown", never as
    "approved" — and dump the HTML with --dump-html when it does not parse, so
    the selectors can be fixed against reality instead of guessed at twice.
    """
    opener, jar = _opener_with_cookies()
    _get(opener, LOGIN_URL).read()
    payload = urllib.parse.urlencode(
        {
            "csrfmiddlewaretoken": _csrf(jar),
            "username": username,
            "password": password,
            "next": "/local/",
        }
    ).encode()
    with _get(opener, LOGIN_URL, payload) as resp:
        html = resp.read().decode("utf-8", "replace")
    if "accounts/login" in resp.geturl():
        raise RuntimeError("EGO login failed (still on the login page)")

    with _get(opener, f"{BASE}/local/") as resp:
        local_html = resp.read().decode("utf-8", "replace")
    if dump_dir:
        os.makedirs(dump_dir, exist_ok=True)
        with open(os.path.join(dump_dir, "local.html"), "w") as fh:
            fh.write(local_html)

    # The author's list marks each extension with its review state. Keep the
    # whole surrounding block rather than a narrow selector: the markup is
    # unversioned and changes without notice.
    block = ""
    idx = local_html.find(uuid)
    if idx >= 0:
        block = re.sub(r"<[^>]+>", " ", local_html[max(0, idx - 1500): idx + 1500])
        block = re.sub(r"\s+", " ", block).strip()
    return {"found": idx >= 0, "context": block, "login_ok": True}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--uuid", default=DEFAULT_UUID)
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--dump-html", metavar="DIR", help="save fetched author pages")
    args = ap.parse_args()

    result = {"uuid": args.uuid, "published": False}
    try:
        published, payload = public_state(args.uuid)
    except Exception as e:
        print(f"error: cannot reach extensions.gnome.org: {e}", file=sys.stderr)
        return 2
    result["published"] = published
    if published:
        result["version"] = payload.get("version")
        result["version_name"] = payload.get("version_name")
        result["name"] = payload.get("name")
        result["shell_version_map"] = payload.get("shell_version_map")

    user = os.environ.get("EGO_USERNAME")
    password = os.environ.get("EGO_PASSWORD")
    if user and password:
        try:
            result["author"] = author_state(args.uuid, user, password, args.dump_html)
        except Exception as e:
            result["author"] = {"error": str(e)}
    else:
        result["author"] = {"skipped": "EGO_USERNAME/EGO_PASSWORD not set"}

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif published:
        print(f"published: {result.get('version_name')} (code {result.get('version')})")
    else:
        print("not published yet (submitted, under review, or waiting for author)")
        author = result.get("author", {})
        if "context" in author and author["context"]:
            print("--- author page context ---")
            print(author["context"][:1200])
        elif "error" in author:
            print(f"author page unavailable: {author['error']}", file=sys.stderr)
        elif "skipped" in author:
            print(f"({author['skipped']})", file=sys.stderr)

    return 0 if published else 10


if __name__ == "__main__":
    sys.exit(main())
