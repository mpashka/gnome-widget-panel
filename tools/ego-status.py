#!/usr/bin/env python3
"""Report where this extension stands on extensions.gnome.org (EGO).

EGO has no official API, so this drives the two things that do work:

1. **Unauthenticated** — `GET /extension-info/?uuid=<uuid>`. While no version is
   published the endpoint answers 404; once the extension is live it answers JSON
   with the approved version. That is the credential-free "approved yet?" signal.

2. **Authenticated** — with EGO_USERNAME (or EGO_LOGIN) / EGO_PASSWORD it logs in
   through the website's form (the flow `.github/scripts/ego-upload.py` uses) and
   reads the author-visible pages, which the public gets a 404 for:

   - `/extension/<id>/` — the per-version table: version → status
     (Unreviewed / Rejected / Active / Inactive) and a link to each review.
   - `/review/<pk>/` — one submitted version: the **reviewer's comments** and the
     findings of **Shexli**, EGO's automated checker (rule code, severity, title,
     explanation and the file:line hits). Rejections are argued there, so this is
     what to read before touching any code.

   Reviewer comments also arrive by email to the account owner; this reads them
   from the site so a watcher can notice them without mailbox access.

Exit codes:
    0   published
    10  not published (submitted / unreviewed / rejected)
    20  --state given and something changed since the previous run
    2   error (network, login, unparseable page)

Usage:
    tools/ego-status.py [--uuid UUID] [--extension-id N] [--json]
                        [--state FILE] [--dump-html DIR]

See docs/process/promotion.md.
"""

import argparse
import html as html_mod
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
DEFAULT_EXTENSION_ID = 10381
USER_AGENT = "gnome-widget-panel-status/1.0"
TIMEOUT = 30


def _text(fragment):
    """Markup fragment -> collapsed plain text."""
    out = re.sub(r"<(script|style).*?</\1>", " ", fragment, flags=re.S | re.I)
    out = re.sub(r"<[^>]+>", " ", out)
    return re.sub(r"\s+", " ", html_mod.unescape(out)).strip()


def _opener_with_cookies():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)), jar


def _request(opener, url, data=None):
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("User-Agent", USER_AGENT)
    if data:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        req.add_header("Referer", LOGIN_URL)
    return opener.open(req, timeout=TIMEOUT)


def public_state(uuid):
    """(published, payload) from the unauthenticated endpoint."""
    opener, _ = _opener_with_cookies()
    url = f"{BASE}/extension-info/?{urllib.parse.urlencode({'uuid': uuid})}"
    try:
        with _request(opener, url) as resp:
            return True, json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, None
        raise


def _login(username, password):
    opener, jar = _opener_with_cookies()
    _request(opener, LOGIN_URL).read()
    csrf = next((c.value for c in jar if c.name == "csrftoken"), "")
    payload = urllib.parse.urlencode(
        {
            "csrfmiddlewaretoken": csrf,
            "username": username,
            "password": password,
            "next": "/",
        }
    ).encode()
    with _request(opener, LOGIN_URL, payload) as resp:
        resp.read()
        if "accounts/login" in resp.geturl():
            raise RuntimeError("EGO login failed (still on the login page)")
    return opener


def parse_versions(page):
    """[{pk, version, status, review_url}] from the extension page's table.

    Each row is `<tr data-pk="74477">` with the version in the first cell and the
    status as a link to that version's review page.
    """
    versions = []
    for row in re.findall(r'<tr data-pk="(\d+)">(.*?)</tr>', page, flags=re.S):
        pk, body = row
        cells = re.findall(r"<td[^>]*>(.*?)</td>", body, flags=re.S)
        status = re.search(
            r'<a class="extension-status [^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
            body,
            flags=re.S,
        )
        versions.append(
            {
                "pk": int(pk),
                "version": _text(cells[0]) if cells else "",
                "status": _text(status.group(2)) if status else "",
                "review_url": BASE + status.group(1) if status else "",
            }
        )
    return versions


def parse_review(page):
    """{comments, shexli:[…]} from one /review/<pk>/ page.

    Reviewer comments and Shexli findings share the `review` CSS class; the
    findings additionally carry `shexli-finding`, which is what separates them.
    """
    comments = []
    for block in re.findall(
        r'<div class="review(?![^"]*shexli-finding)[^"]*">(.*?)</div>', page, flags=re.S
    ):
        text = _text(block)
        if text:
            comments.append(text)
    no_comments = "No comments." in _text(page)

    findings = []
    for block in re.findall(
        r'<div class="review shexli-finding[^"]*">(.*?)</div>\s*(?=<div class="review|</div>)',
        page,
        flags=re.S,
    ):
        code = re.search(r"<strong>([A-Z]+-[A-Z]-\d+)</strong>", block)
        severity = re.search(r'<span class="shexli-severity[^"]*">(.*?)</span>', block, flags=re.S)
        paragraphs = [_text(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", block, flags=re.S)]
        # The first paragraph is the code+severity header; the next two are the
        # rule title and its explanation.
        body = [p for p in paragraphs[1:] if p]
        locations = []
        for item in re.findall(r"<li>(.*?)</li>", block, flags=re.S):
            file_match = re.search(r"<code>(.*?)</code>\s*:?(\d+)?", item, flags=re.S)
            snippet = re.search(r"<pre>(.*?)</pre>", item, flags=re.S)
            locations.append(
                {
                    "file": _text(file_match.group(1)) if file_match else _text(item),
                    "line": int(file_match.group(2))
                    if file_match and file_match.group(2)
                    else None,
                    "snippet": html_mod.unescape(snippet.group(1)).strip()
                    if snippet
                    else "",
                }
            )
        findings.append(
            {
                "code": code.group(1) if code else "",
                "severity": _text(severity.group(1)) if severity else "",
                "title": body[0] if body else "",
                "detail": body[1] if len(body) > 1 else "",
                "locations": locations,
            }
        )
    return {"comments": comments, "no_comments": no_comments, "shexli": findings}


def author_state(opener, extension_id, dump_dir=None):
    url = f"{BASE}/extension/{extension_id}/"
    with _request(opener, url) as resp:
        page = resp.read().decode("utf-8", "replace")
    if dump_dir:
        os.makedirs(dump_dir, exist_ok=True)
        with open(os.path.join(dump_dir, f"extension_{extension_id}.html"), "w") as fh:
            fh.write(page)

    versions = parse_versions(page)
    if not versions:
        # Never report "nothing to see" from an unparsed page: the markup is
        # unversioned and changes without notice. Say so and keep the HTML.
        return {"error": "could not parse the versions table", "url": url}

    reviews = []
    for version in versions:
        if not version["review_url"]:
            continue
        with _request(opener, version["review_url"]) as resp:
            review_page = resp.read().decode("utf-8", "replace")
        if dump_dir:
            with open(os.path.join(dump_dir, f"review_{version['pk']}.html"), "w") as fh:
                fh.write(review_page)
        parsed = parse_review(review_page)
        parsed.update(
            {
                "version": version["version"],
                "pk": version["pk"],
                "status": version["status"],
                "url": version["review_url"],
            }
        )
        reviews.append(parsed)
    return {"versions": versions, "reviews": reviews, "url": url}


def summarise(result):
    lines = []
    if result["published"]:
        lines.append(
            f"published: {result.get('version_name')} (code {result.get('version')})"
        )
    else:
        lines.append("not published yet")

    author = result.get("author", {})
    if "error" in author:
        lines.append(f"author pages: {author['error']}")
        return lines
    for version in author.get("versions", []):
        lines.append(f"  {version['version']}: {version['status']}")
    for review in author.get("reviews", []):
        if review["comments"]:
            lines.append(f"  reviewer comments on {review['version']}:")
            lines.extend(f"    - {c}" for c in review["comments"])
        elif not review["no_comments"]:
            lines.append(f"  {review['version']}: comment section did not parse")
        for finding in review["shexli"]:
            where = ", ".join(
                f"{loc['file']}:{loc['line']}" if loc["line"] else loc["file"]
                for loc in finding["locations"]
            )
            lines.append(
                f"  [{review['version']}] {finding['code']} {finding['severity']}: "
                f"{finding['title']}"
            )
            if where:
                lines.append(f"      {where}")
    return lines


def comparable(result):
    """The part of the result a watcher should react to."""
    author = result.get("author", {})
    return {
        "published": result["published"],
        "version": result.get("version"),
        "versions": {v["version"]: v["status"] for v in author.get("versions", [])},
        "reviews": {
            r["version"]: {
                "comments": r["comments"],
                "shexli": [
                    [f["code"], [f"{l['file']}:{l['line']}" for l in f["locations"]]]
                    for f in r["shexli"]
                ],
            }
            for r in author.get("reviews", [])
        },
    }


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--uuid", default=DEFAULT_UUID)
    ap.add_argument("--extension-id", type=int, default=DEFAULT_EXTENSION_ID)
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument(
        "--state",
        metavar="FILE",
        help="compare with the previous run stored here, then update it; "
        "exit 20 when anything changed",
    )
    ap.add_argument("--dump-html", metavar="DIR", help="save the fetched pages")
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
        result["shell_version_map"] = payload.get("shell_version_map")

    # EGO_USERNAME is the release workflow's secret; EGO_LOGIN is what the
    # developer's ~/.profile exports. Accept either instead of making one rename.
    user = os.environ.get("EGO_USERNAME") or os.environ.get("EGO_LOGIN")
    password = os.environ.get("EGO_PASSWORD")
    if user and password:
        try:
            opener = _login(user, password)
            result["author"] = author_state(opener, args.extension_id, args.dump_html)
        except Exception as e:
            result["author"] = {"error": str(e)}
    else:
        result["author"] = {"skipped": "EGO_USERNAME (or EGO_LOGIN) / EGO_PASSWORD not set"}

    changed = False
    if args.state:
        previous = None
        if os.path.exists(args.state):
            try:
                with open(args.state) as fh:
                    previous = json.load(fh)
            except Exception:
                previous = None
        current = comparable(result)
        changed = previous is not None and previous != current
        first_run = previous is None
        os.makedirs(os.path.dirname(os.path.abspath(args.state)) or ".", exist_ok=True)
        with open(args.state, "w") as fh:
            json.dump(current, fh, indent=2, ensure_ascii=False, sort_keys=True)
        if changed:
            result["changed_from"] = previous
        elif first_run:
            result["state_initialised"] = True

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        if changed:
            print("CHANGED since the previous run")
        print("\n".join(summarise(result)))

    if changed:
        return 20
    return 0 if published else 10


if __name__ == "__main__":
    sys.exit(main())
