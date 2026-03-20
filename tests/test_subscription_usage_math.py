"""Unit tests for metered overage delta math (no Stripe)."""

import pytest

from subscription_usage_math import compute_stripe_overage_increment


def test_first_report_full_overage():
    delta, new_stored, _period, persist_reset = compute_stripe_overage_increment(
        1500, 1000, "period_b", "", 0
    )
    assert delta == 500
    assert new_stored == 500
    assert persist_reset is False


def test_repeat_idempotent():
    delta, new_stored, _period, persist_reset = compute_stripe_overage_increment(
        1500, 1000, "period_b", "period_b", 500
    )
    assert delta == 0
    assert new_stored == 500
    assert persist_reset is False


def test_incremental_delta():
    delta, new_stored, _period, persist_reset = compute_stripe_overage_increment(
        1600, 1000, "period_b", "period_b", 500
    )
    assert delta == 100
    assert new_stored == 600
    assert persist_reset is False


def test_new_period_resets_stored():
    delta, new_stored, _period, persist_reset = compute_stripe_overage_increment(
        50, 1000, "period_c", "period_b", 500
    )
    assert delta == 0
    assert persist_reset is True


def test_new_period_with_overage():
    delta, new_stored, _period, persist_reset = compute_stripe_overage_increment(
        1200, 1000, "period_c", "period_b", 500
    )
    assert delta == 200
    assert new_stored == 200
    assert persist_reset is False
