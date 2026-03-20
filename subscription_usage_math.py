"""Pure helpers for Stripe metered overage reporting (no Flask/Stripe imports)."""


def compute_stripe_overage_increment(
    total_scans,
    included_scans,
    billing_period_start_key,
    stored_period_start_key,
    stored_reported_units,
):
    """
    Decide how many overage units to send to Stripe on this run (delta only).

    billing_period_start_key: stable string for the current subscription period (use the same format as stored_key, e.g. Stripe period start as unix epoch string).
    stored_*: values persisted on the tenant from the last successful report.

    Returns:
        (delta_to_report, new_stored_total, new_period_key_to_store, should_persist_without_stripe)
    - After a successful UsageRecord when delta_to_report > 0: persist new_stored_total and new_period_key.
    - When should_persist_without_stripe is True (billing period rolled, delta 0): persist zeros so DB
      does not keep last period's reported totals.
    """
    O = max(0, int(total_scans) - int(included_scans))
    period_key = billing_period_start_key or ""
    stored_key = stored_period_start_key or ""
    period_changed = period_key != stored_key

    R = 0 if period_changed else int(stored_reported_units or 0)
    delta = max(0, O - R)
    new_period = period_key
    new_stored = O if delta > 0 else R
    persist_reset = period_changed and delta == 0
    return delta, new_stored, new_period, persist_reset
