#Talks to /api/eval/chat and checks the fixture is in the state the golden set assumes.

from __future__ import annotations

import json
import os
import pathlib
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:3000")
EVAL_SECRET = os.environ["EVAL_SECRET"]
APP_COOKIE = os.environ["APP_COOKIE"]          # copied from a logged-in browser session
EVAL_TODAY = os.environ.get("EVAL_TODAY", "2026-09-22")
TIMEOUT = int(os.environ.get("EVAL_TIMEOUT", "240"))

GOLDEN_PATH = pathlib.Path(__file__).resolve().parents[1] / "golden" / "golden.json"

_session = requests.Session()


def load_golden() -> dict:
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def ask(question: str, history: list[dict] | None = None) -> dict[str, Any]:
    #One turn. Returns the endpoint's full payload: reply, loadStatus, trace, today.
    #everything that a user would see
    res = _session.post(
        f"{BASE_URL}/api/eval/chat",
        headers={
            "content-type": "application/json",
            "x-eval-secret": EVAL_SECRET,
            "cookie": APP_COOKIE,
        },
        json={"question": question, "history": history or []},
        timeout=TIMEOUT,
    )
    if res.status_code == 401:
        raise SystemExit("401 from the eval route: EVAL_SECRET mismatch, or the session cookie expired.")
    if res.status_code == 404:
        raise SystemExit("404 from the eval route: set EVAL_ENABLED=true and restart the dev server.")
    res.raise_for_status()
    return res.json()


def preflight() -> None:
    """Fail loudly before spending money on a run against the wrong fixture.

    Every check here has burned an eval run at some point: a stale seed, an expired cookie,
    an unfrozen clock, an empty contract index.
    """
    golden = load_golden()
    e05 = golden["events"]["E-05"]

    res = ask("What deadlines are open on this project?")

    if res.get("today") != EVAL_TODAY:
        raise SystemExit(
            f"Server clock is {res.get('today')}, expected {EVAL_TODAY}. "
            "Set EVAL_TODAY in .env.local and restart the dev server."
        )

    if res.get("loadStatus") != "ok":
        raise SystemExit(f"loadStatus={res.get('loadStatus')} failed={res.get('failedSections')}")

    trace = res.get("trace", {})
    digest = trace.get("digest") or []
    if not digest:
        raise SystemExit("Digest is empty — the fixture isn't seeded. Run seed_reem_gardens.sql.")

    notice = next(
        (d for d in digest if d.get("eventId") == e05 and (d.get("dueDate") == EVAL_TODAY)),
        None,
    )
    if notice is None:
        raise SystemExit(
            "E-05's 20.1 notice is not due today in the digest. The seed and the frozen clock "
            "disagree — re-run the seed with the same date as EVAL_TODAY."
        )

    retrieval = trace.get("retrieval") or {}
    candidates = retrieval.get("candidates")
    if not candidates:
        print(
            "WARNING: retrieval returned no candidates at all. The contract index is probably "
            "empty, so every RAG metric in this run will be zero.\n"
        )
    else:
        top = max(c["score"] for c in candidates)
        print(f"Preflight OK. Clock {EVAL_TODAY}. {len(digest)} open obligations. "
              f"{len(candidates)} retrieval candidates, best score {top:.3f}.\n")