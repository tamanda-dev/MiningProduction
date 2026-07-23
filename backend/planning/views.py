from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError
from rest_framework.viewsets import ModelViewSet

from core.mixins import SiteScopedQuerySetMixin
from core.permissions import ReadOnlyOrSupervisorOrAbove

from .models import PlanTarget
from .serializers import PlanTargetSerializer

_DUPLICATE_TARGET_MESSAGE = (
    "A plan target already exists for this parameter/section/machine/period/date combination — "
    "edit that one instead of creating a duplicate."
)


class PlanTargetViewSet(SiteScopedQuerySetMixin, ModelViewSet):
    queryset = PlanTarget.objects.select_related(
        "parameter", "site", "section", "machine", "shift_instance"
    ).all()
    serializer_class = PlanTargetSerializer
    permission_classes = (ReadOnlyOrSupervisorOrAbove,)
    filterset_fields = ("site", "section", "machine", "parameter", "period_type", "period_date", "shift_instance")
    site_lookup = "site_id"

    # PlanTarget.target_key is a computed uniqueness guard collapsing every
    # dimension (parameter/section/machine/period_type/shift_instance/
    # period_date) into one string — a collision means "this exact target
    # already exists", which previously surfaced as an unhandled 500
    # IntegrityError instead of a clean validation message.
    def perform_create(self, serializer):
        try:
            # Catching IntegrityError alone isn't enough: without its own
            # savepoint, the failed INSERT still poisons the surrounding
            # transaction (Django's "you can't execute queries until the
            # end of the 'atomic' block" — bites under pytest's per-test
            # transaction wrapping, and would bite in production too under
            # ATOMIC_REQUESTS). atomic() here scopes the rollback to just
            # this save.
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": _DUPLICATE_TARGET_MESSAGE})

    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": _DUPLICATE_TARGET_MESSAGE})
