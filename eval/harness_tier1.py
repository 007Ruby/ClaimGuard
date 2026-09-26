#Harness 1: deterministic. 

"""Checks only things with a right answer: the dates, amounts and clause numbers the engine
computed, the values that must never appear, which event records were pulled, and whether
retrieval surfaced the expected clauses. No model judges anything here, so this harness is
cheap, fast and repeatable — run it after every change.

    python -m eval.harness_tier1

Scores logged to Langfuse:
    tier1_values        fraction of required values present (hard gate: 1.0 or fail)
    forbidden_clean     1.0 unless a forbidden value appeared
    source_recall       expected event records that were pulled
    source_precision    pulled event records that were expected
    retrieval_recall    expected clauses that retrieval surfaced
    retrieval_precision pulled clauses that were expected
    passed             1.0 only if tier1_values == 1 and forbidden_clean == 1
"""

from __future__ import annotations

from langfuse import Evaluation, get_client

from eval.lib import matchers as m
from eval.lib.client import ask, load_golden, preflight

MAX_CHUNK_CHARS = 400

def build_data(golden: dict) -> list[dict]:
    return [
        {
            "input": item["question"],
            "expected_output": item["reference_answer"],
            "metadata": item,
        }
        for item in golden["items"]
    ]


def task(*, item, **_):
    """Ask the app one question and hand back the reply plus a trimmed trace."""
    res = ask(item["input"])
    trace = res.get("trace", {})
    retrieval = trace.get("retrieval") or {}
    return {
        "reply": res.get("reply", ""),
        "load_status": res.get("loadStatus"),
        "matched_events": [x["eventId"] for x in trace.get("eventMatch", {}).get("matches", [])],
        "event_candidates": trace.get("eventMatch", {}).get("candidates", []),
        "chunks": [
            {
                "clause": c.get("sourceClauseRef"),
                "score": c.get("score"),
                "text": (c.get("text") or "")[:MAX_CHUNK_CHARS],
            }
            for c in retrieval.get("chunks", [])
        ],
        "retrieval_candidates": retrieval.get("candidates", []),
        "digest": trace.get("digest", []),
        "latency_ms": trace.get("latencyMs"),
    }


# ------------------------------------------------------------------ evaluators

#checks that required values in response were present
def tier1_values(*, output, metadata, **_):
    score, missing = m.check_include(output["reply"], metadata.get("must_include", []))
    return Evaluation(
        name="tier1_values",
        value=score,
        comment="all present" if not missing else f"missing: {', '.join(missing)}",
    )

#checks that forbidden values in response were not present
def forbidden_clean(*, output, metadata, **_):
    score, present = m.check_exclude(output["reply"], metadata.get("must_exclude", []))
    return Evaluation(
        name="forbidden_clean",
        value=score,
        comment="clean" if not present else f"FORBIDDEN PRESENT: {', '.join(present)}",
    )

#checks the quality of the event data that was pulled: recall and precision
#   recall: of the expected data, how much was actually pulled?
#   precision: of the data, how much was actually expected?
def event_retrieval(*, output, metadata, **_):
    s = m.source_scores(output["matched_events"], metadata.get("expected_events", []))
    return [
        Evaluation(name="event_recall", value=s["event_recall"]),
        Evaluation(
            name="event_precision",
            value=s["event_precision"],
            comment=f"matched {output['matched_events']}",
        ),
    ]

#checks the quality of the clause data that was pulled: recall and precision
#   recall: of the expected data, how much was actually pulled?
#   precision: of the data, how much was actually expected?
def clause_retrieval(*, output, metadata, **_):
    r = m.retrieval_scores(
        output["chunks"],
        metadata.get("expected_clauses", [])
    )

    return [
        Evaluation(
            name="clause_recall",
            value=r["clause_recall"],
            comment=f"retrieved {r['retrieved_clauses']}",
        ),
        Evaluation(
            name="clause_precision",
            value=r["clause_precision"],
            comment=f"retrieved {r['retrieved_clauses']}",
        ),
    ]

#hard pass/fail
def passed(*, output, metadata, **_):
    values, _ = m.check_include(output["reply"], metadata.get("must_include", []))
    clean, _ = m.check_exclude(output["reply"], metadata.get("must_exclude", []))
    ok = values == 1.0 and clean == 1.0
    return Evaluation(name="passed", value=1.0 if ok else 0.0)


def pass_rate(*, item_results, **_):
    vals = [e.value for r in item_results for e in r.evaluations if e.name == "passed"]
    if not vals:
        return Evaluation(name="pass_rate", value=None)
    rate = sum(vals) / len(vals)
    return Evaluation(name="pass_rate", value=rate, comment=f"{int(sum(vals))}/{len(vals)} passed")


def main() -> None:
    preflight()
    golden = load_golden()
    langfuse = get_client()

    result = langfuse.run_experiment(
        name="tier1-deterministic",
        description="Engine values, forbidden values, source selection and retrieval recall.",
        data=build_data(golden),
        task=task,
        evaluators=[tier1_values, forbidden_clean, event_retrieval, clause_retrieval, passed],
        run_evaluators=[pass_rate],
        max_concurrency=2,   # the app is a single dev server
        metadata={"today": golden["meta"]["today"], "golden_version": golden["meta"]["version"]},
    )

    print(result.format())
    langfuse.flush()


if __name__ == "__main__":
    main()