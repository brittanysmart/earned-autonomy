#!/usr/bin/env python3
"""Tests for the governance rule at the heart of the project.

The whole thesis is that the human-review threshold is enforced in code, not by the
model. These tests pin that behavior down: a convincing-but-unsure score can't slip
past review, and out-of-range model output can't sneak under the threshold either.

Runnable two ways, no framework required:
    python test_audit.py     # plain asserts, exits non-zero on failure
    pytest test_audit.py     # also collected as normal test_* functions
"""

from audit import REVIEW_THRESHOLD, clamp_confidence, requires_human_review


def test_threshold_is_ninety():
    # The exact number is the thesis. If someone quietly relaxes it, this fails loudly.
    assert REVIEW_THRESHOLD == 90


def test_below_threshold_requires_review():
    assert requires_human_review(0) is True
    assert requires_human_review(89) is True


def test_at_or_above_threshold_skips_review():
    # 90 is the first value trusted to skip a human — the boundary must be exact.
    assert requires_human_review(90) is False
    assert requires_human_review(100) is False


def test_out_of_range_model_output_cannot_bypass_review():
    # A model returning a wild high number must not buy its way out of review by
    # overshooting; clamping happens before the threshold check.
    assert requires_human_review(clamp_confidence(150)) is False  # 150 -> 100, trusted
    assert requires_human_review(clamp_confidence(-20)) is True   # -20 -> 0, still reviewed


def test_clamp_bounds():
    assert clamp_confidence(150) == 100
    assert clamp_confidence(-20) == 0
    assert clamp_confidence(73) == 73


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all governance tests passed")
