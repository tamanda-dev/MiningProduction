from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet

from core.mixins import SiteScopedQuerySetMixin
from core.permissions import IsSupervisorOrAbove

from .filters import AuditLogFilter
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(SiteScopedQuerySetMixin, RetrieveModelMixin, ListModelMixin, GenericViewSet):
    queryset = AuditLog.objects.select_related("actor", "content_type", "site").all()
    serializer_class = AuditLogSerializer
    permission_classes = (IsSupervisorOrAbove,)
    filterset_class = AuditLogFilter
    site_lookup = "site_id"
