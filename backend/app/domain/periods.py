"""Compliance period arithmetic. Pure functions.

Quarters and years follow the Indian financial year (April–March), which is what GST returns use:
    MONTHLY   2026-09-01 -> "2026-09"
    QUARTERLY 2026-07-01 -> "FY2026-27 Q2"
    YEARLY    2026-04-01 -> "FY2026-27"
"""

from datetime import date, timedelta

from app.models import Recurrence

_MONTHS = {Recurrence.MONTHLY: 1, Recurrence.QUARTERLY: 3, Recurrence.YEARLY: 12}


def _add_months(d: date, months: int) -> date:
    idx = d.year * 12 + (d.month - 1) + months
    return date(idx // 12, idx % 12 + 1, 1)


def _fy_start_year(d: date) -> int:
    return d.year if d.month >= 4 else d.year - 1


def period_start_for(d: date, recurrence: Recurrence) -> date:
    """Start of the period that contains `d`."""
    if recurrence == Recurrence.MONTHLY:
        return d.replace(day=1)
    if recurrence == Recurrence.QUARTERLY:
        return date(d.year, ((d.month - 1) // 3) * 3 + 1, 1)  # Apr/Jul/Oct/Jan == FY quarters
    return date(_fy_start_year(d), 4, 1)


def is_period_start(d: date, recurrence: Recurrence) -> bool:
    return period_start_for(d, recurrence) == d


def next_period_start(start: date, recurrence: Recurrence) -> date:
    return _add_months(period_start_for(start, recurrence), _MONTHS[recurrence])


def period_end(start: date, recurrence: Recurrence) -> date:
    return next_period_start(start, recurrence) - timedelta(days=1)


def period_label(start: date, recurrence: Recurrence) -> str:
    fy = _fy_start_year(start)
    fy_label = f"FY{fy}-{(fy + 1) % 100:02d}"
    if recurrence == Recurrence.MONTHLY:
        return f"{start.year}-{start.month:02d}"
    if recurrence == Recurrence.QUARTERLY:
        quarter = ((start.month - 4) % 12) // 3 + 1
        return f"{fy_label} Q{quarter}"
    return fy_label


def periods_between(after: date, up_to_including: date, recurrence: Recurrence) -> list[date]:
    """Period starts strictly after `after`, up to the period containing `up_to_including`."""
    target = period_start_for(up_to_including, recurrence)
    out, cur = [], next_period_start(after, recurrence)
    while cur <= target:
        out.append(cur)
        cur = next_period_start(cur, recurrence)
    return out
