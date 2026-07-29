from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from core.mixins import SiteScopedOrOwnQuerySetMixin

from .models import BreakdownLog, DeliveryEntry, ProductionEntry
from .permissions import CanWriteEntry
from .serializers import (
    BreakdownLogSerializer,
    DeliveryEntrySerializer,
    ProductionEntrySerializer,
)


class BulkSyncMixin:
    """Offline-sync contract: the mobile app POSTs a batch of locally-queued
    entries (each carrying a client-generated `client_uuid`) and gets back a
    per-item success/failure array, so it only needs to requeue the items
    that failed. Idempotent on `client_uuid` — a retried item updates its
    prior attempt instead of duplicating it.
    """

    @action(detail=False, methods=["post"])
    def bulk(self, request):
        items = request.data if isinstance(request.data, list) else request.data.get("items", [])
        results = []
        for item in items:
            client_uuid = item.get("client_uuid")
            try:
                # Resolve through the scoped queryset (not the raw model
                # manager) so an existing row outside this user's
                # site/ownership is invisible here, then run the same
                # object-level permission check a normal update() would —
                # otherwise this per-item update path would let anyone
                # rewrite any other site's/operator's entry just by
                # guessing its client_uuid.
                existing = self.get_queryset().filter(client_uuid=client_uuid).first() if client_uuid else None
                if existing is not None:
                    self.check_object_permissions(request, existing)
                serializer = self.get_serializer(instance=existing, data=item, partial=bool(existing))
                serializer.is_valid(raise_exception=True)
                obj = serializer.save()
                results.append({"client_uuid": client_uuid, "success": True, "id": obj.id})
            except Exception as exc:  # noqa: BLE001 — batch item isolation is the point
                detail = getattr(exc, "detail", str(exc))
                results.append({"client_uuid": client_uuid, "success": False, "errors": detail})
        return Response(results)


class ProductionEntryViewSet(BulkSyncMixin, SiteScopedOrOwnQuerySetMixin, ModelViewSet):
    queryset = ProductionEntry.objects.select_related(
        "site", "section", "machine", "shift_instance", "operator", "recorded_by"
    ).prefetch_related("values", "values__parameter").all()
    serializer_class = ProductionEntrySerializer
    permission_classes = (CanWriteEntry,)
    filterset_fields = ("site", "section", "machine", "shift_instance", "entry_type", "status")
    site_lookup = "site_id"


class BreakdownLogViewSet(BulkSyncMixin, SiteScopedOrOwnQuerySetMixin, ModelViewSet):
    queryset = BreakdownLog.objects.select_related(
        "site", "section", "machine", "shift_instance", "reason_code", "operator", "recorded_by"
    ).prefetch_related("values", "values__parameter").all()
    serializer_class = BreakdownLogSerializer
    permission_classes = (CanWriteEntry,)
    filterset_fields = ("site", "section", "machine", "shift_instance", "reason_code", "status")
    site_lookup = "site_id"


class DeliveryEntryViewSet(BulkSyncMixin, SiteScopedOrOwnQuerySetMixin, ModelViewSet):
    queryset = DeliveryEntry.objects.select_related(
        "site", "section", "delivery_destination", "shift_instance", "operator", "recorded_by"
    ).prefetch_related("values", "values__parameter").all()
    serializer_class = DeliveryEntrySerializer
    permission_classes = (CanWriteEntry,)
    filterset_fields = ("site", "section", "delivery_destination", "shift_instance", "status")
    site_lookup = "site_id"
