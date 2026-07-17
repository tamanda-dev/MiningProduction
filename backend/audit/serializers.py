from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    # A plain `source="actor.__str__"` CharField breaks when actor is None:
    # DRF's dotted-source traversal resolves to NoneType's inherited
    # __str__ *bound method* itself (not its call result), which CharField
    # then stringifies into a garbled "<method-wrapper ...>" value instead
    # of the null the frontend expects (EntryHistoryPanel falls back to
    # "system" for a null actor_label).
    actor_label = serializers.SerializerMethodField()
    content_type_label = serializers.CharField(source="content_type.model", read_only=True)

    def get_actor_label(self, obj) -> str | None:
        return str(obj.actor) if obj.actor_id else None

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "created_at",
            "actor",
            "actor_label",
            "action",
            "content_type_label",
            "object_id",
            "site",
            "changes",
            "reason",
        )
        read_only_fields = fields
