"""Deterministic checks. No model involved — these either pass or they don't.

The hard part is surface forms: a model may write 29 September 2026, 29 Sep 2026 or
2026-09-29 and all three are correct. Each check expands its value into every form a
reasonable answer might use, then looks for any of them.
"""

from __future__ import annotations

import re
from datetime import date

MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]


def normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").lower()


def date_forms(iso: str) -> list[str]:
    d = date.fromisoformat(iso)
    m_full, m_abbr = MONTHS[d.month - 1], MONTHS[d.month - 1][:3]
    return [
        iso,
        f"{d.day} {m_full} {d.year}",
        f"{d.day} {m_abbr} {d.year}",
        f"{d.day:02d} {m_full} {d.year}",
        f"{m_full} {d.day}, {d.year}",
        f"{m_abbr} {d.day}, {d.year}",
        f"{d.day}/{d.month}/{d.year}",
        f"{d.day:02d}/{d.month:02d}/{d.year}",
        f"{d.day} {m_full}",
        f"{d.day} {m_abbr}",
    ]


def amount_forms(value: float) -> list[str]:
    n = int(value) if float(value).is_integer() else value
    plain = f"{n}"
    grouped = f"{n:,}"
    forms = [plain, grouped, f"aed {grouped}", f"aed{grouped}", f"{grouped} aed"]
    if isinstance(n, int) and n >= 1_000_000 and n % 100_000 == 0:
        millions = n / 1_000_000
        m = f"{millions:.1f}".rstrip("0").rstrip(".")
        forms += [f"{m} million", f"aed {m} million", f"{m}m"]
    return forms


def spec_forms(spec: dict) -> list[str]:
    kind = spec["kind"]
    if kind == "date":
        return date_forms(spec["value"])
    if kind == "amount":
        return amount_forms(spec["value"])
    if kind == "text":
        return [str(spec["value"])]
    if kind == "any":
        return [str(o) for o in spec["options"]]
    raise ValueError(f"Unknown spec kind: {kind}")


def spec_label(spec: dict) -> str:
    return f"{spec['kind']}:{spec.get('value', spec.get('options'))}"


def found(reply: str, spec: dict) -> bool:
    hay = normalise(reply)
    return any(normalise(f) in hay for f in spec_forms(spec))


def check_include(reply: str, specs: list[dict]) -> tuple[float, list[str]]:
    """Fraction of required values present, plus the labels of the missing ones."""
    if not specs:
        return 1.0, []
    missing = [spec_label(s) for s in specs if not found(reply, s)]
    return (len(specs) - len(missing)) / len(specs), missing


def check_exclude(reply: str, specs: list[dict]) -> tuple[float, list[str]]:
    """1.0 when no forbidden value appears, plus the labels of any that did."""
    if not specs:
        return 1.0, []
    present = [spec_label(s) for s in specs if found(reply, s)]
    return 0.0 if present else 1.0, present


# --------------------------------------------------------------------------- sources

def source_scores(matched_event_ids: list[str], expected_event_ids: list[str]) -> dict:
    """Did the bot pull the right event records?

    Recall: how many expected events were expanded. Precision: how many expanded events
    were expected. When no event is expected (a pure contract question), expanding none
    is a perfect score and expanding some is a precision miss.
    """
    got, want = set(matched_event_ids), set(expected_event_ids)
    if not want:
        return {"source_recall": 1.0, "source_precision": 1.0 if not got else 0.0}
    hits = len(got & want)
    return {
        "event_recall": hits / len(want),
        "event_precision": hits / len(got) if got else 0.0,
    }


# ------------------------------------------------------------------------- retrieval

def _clause_key(ref: str | None) -> str:
    if not ref:
        return ""
    return re.sub(r"^(pc|sc|sub-clause|clause)[\s\-\.]*", "", ref.strip().lower())


def retrieval_scores(chunks: list[dict], expected_clauses: list[str]) -> dict:
    """Did retrieval surface the right clauses?

    Recall: how many expected clauses were retrieved?
    Precision: how many retrieved clauses were actually expected?

    Matched on clause number rather than chunk id so the labels survive
    re-chunking. PC-14.2 and 14.2 are treated as the same clause.
    """

    got = {
        _clause_key(c.get("clause") or c.get("sourceClauseRef"))
        for c in chunks
    }
    got.discard("")

    want = {_clause_key(c) for c in expected_clauses}
    want.discard("")

    if not want:
        return {
            "clause_recall": 1.0,
            "clause_precision": 1.0 if not got else 0.0,
            "retrieved_clauses": sorted(got),
        }

    hits = {
        w for w in want
        if any(g == w or g.startswith(w + ".") for g in got)
    }

    precision_hits = {
        g for g in got
        if any(g == w or g.startswith(w + ".") for w in want)
    }

    return {
        "clause_recall": len(hits) / len(want),
        "clause_precision": (
            len(precision_hits) / len(got)
            if got else 0.0
        ),
        "retrieved_clauses": sorted(got),
    }