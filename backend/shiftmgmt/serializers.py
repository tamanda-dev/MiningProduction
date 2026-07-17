from rest_framework import serializers

from .models import Shift, ShiftInstance


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = ("id", "site", "name", "start_time", "end_time", "slot_length_minutes", "active")


class ShiftInstanceSerializer(serializers.ModelSerializer):
    shift_name = serializers.CharField(source="shift.name", read_only=True)

    class Meta:
        model = ShiftInstance
        fields = (
            "id",
            "shift",
            "shift_name",
            "date",
            "site",
            "status",
            "closed_at",
            "closed_by",
            "approved_at",
            "approved_by",
        )
        read_only_fields = ("site", "status", "closed_at", "closed_by", "approved_at", "approved_by")


class TimeSlotSerializer(serializers.Serializer):
    slot_index = serializers.IntegerField()
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()
