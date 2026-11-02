from collections import defaultdict


def resolve_claims(claims, quality):
    """Apply only explicit, unambiguous references; unresolved chains are excluded."""
    by_id = defaultdict(list)
    for claim in claims:
        by_id[claim["claim_id"]].append(claim)
    unresolved = {claim_id for claim_id, rows in by_id.items() if len(rows) > 1}
    actions_by_target = defaultdict(list)
    for claim in claims:
        status = claim["claim_status"]
        reference = (claim["adjustment_reference"] if status == "adjusted"
                     else claim["reversal_reference"] if status == "reversed" else "")
        if not reference:
            continue
        targets = by_id.get(reference, [])
        if len(targets) != 1 or reference == claim["claim_id"]:
            unresolved.add(claim["claim_id"])
            if len(targets) == 1:
                unresolved.add(reference)
            continue
        target = targets[0]
        same_claim_context = all(target[field] == claim[field] for field in (
            "member_id", "plan_id", "hcpcs_code", "site_npi", "service_date"))
        if not same_claim_context:
            unresolved.update((claim["claim_id"], reference))
            continue
        actions_by_target[reference].append(claim)

    for target_id, actions in actions_by_target.items():
        if len(actions) != 1:
            unresolved.add(target_id)
            unresolved.update(action["claim_id"] for action in actions)

    # Flag cycles rather than choosing an arbitrary record from a broken chain.
    next_reference = {}
    for target_id, actions in actions_by_target.items():
        if len(actions) == 1:
            action = actions[0]
            if action["claim_status"] == "adjusted":
                next_reference[action["claim_id"]] = target_id
    for start in next_reference:
        path, current = set(), start
        while current in next_reference:
            if current in path:
                unresolved.update(path)
                break
            path.add(current)
            current = next_reference[current]

    superseded_ids = set(actions_by_target)
    output = []
    handled = set()
    for claim in claims:
        claim_id = claim["claim_id"]
        if claim_id in handled:
            continue
        handled.add(claim_id)
        if claim_id in unresolved:
            _reason(quality, "unresolved_adjustment_or_duplicate")
            continue
        if claim["claim_status"] == "denied":
            _reason(quality, "denied_claim")
            continue
        if claim["claim_status"] == "reversed":
            quality["reversed_records"] += 1
            _reason(quality, "reversal_transaction")
            continue
        if claim_id in superseded_ids:
            if actions_by_target[claim_id][0]["claim_status"] == "reversed":
                quality["reversed_records"] += 1
                _reason(quality, "reversed_original_claim")
            else:
                quality["adjusted_records"] += 1
                _reason(quality, "superseded_by_adjustment")
            continue
        if claim["claim_status"] in {"paid", "approved", "adjusted"}:
            output.append(claim)
    return output


def _reason(quality, reason):
    quality["reasons"][reason] = quality["reasons"].get(reason, 0) + 1
    quality["excluded_records"] += 1
