import pytest

from masterdata.models import Parameter
from planning.models import PlanTarget


@pytest.mark.django_db
def test_duplicate_plan_target_returns_clean_400_not_500(api_client, sections, supervisor_site_a):
    """Regression test: PlanTarget.target_key is a computed uniqueness key
    (parameter/section/machine/period_type/shift_instance/period_date
    collapsed into one string) that DRF's serializer has no visibility
    into — a collision used to bubble up as an unhandled 500 IntegrityError
    instead of a clean validation error.
    """
    sec_a, _ = sections
    parameter = Parameter.objects.create(
        name="Tonnes Hauled", code="tonnes-hauled-test", scope=Parameter.SCOPE_MACHINE, data_type=Parameter.DATA_TYPE_NUMBER
    )
    PlanTarget.objects.create(
        parameter=parameter, site=sec_a.site, section=sec_a, period_type=PlanTarget.PERIOD_DAY,
        period_date="2026-01-01", target_value=500,
    )

    api_client.force_authenticate(user=supervisor_site_a)
    resp = api_client.post(
        "/api/plan-targets/",
        {
            "parameter": parameter.id,
            "site": sec_a.site_id,
            "section": sec_a.id,
            "period_type": "day",
            "period_date": "2026-01-01",
            "target_value": 999,
        },
        format="json",
    )

    assert resp.status_code == 400, resp.data
    assert "already exists" in str(resp.data).lower()
    assert PlanTarget.objects.filter(parameter=parameter).count() == 1
