from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone
from rest_framework import serializers

from entries import services as entries_services
from shiftmgmt.models import ShiftInstance
from shiftmgmt.services import get_or_create_open_instance

from . import services
from .models import (
    BreakdownCause,
    BreakdownIncident,
    ChecklistItem,
    HourlyBreakdownEntry,
    HourlyChecklistEntry,
    HourlySlot,
    ShiftCrushingSummary,
)


def _conflict(detail):
    raise serializers.ValidationError({"detail": detail, "code": "slot_conflict"})


class BreakdownParetoRowSerializer(serializers.Serializer):
    cause = serializers.IntegerField(allow_null=True)
    cause_name = serializers.CharField()
    hourly_tick_count = serializers.IntegerField()
    incident_count = serializers.IntegerField()
    incident_total_minutes = serializers.IntegerField()


class MttrMtbfTrendPointSerializer(serializers.Serializer):
    period = serializers.CharField()
    mttr_minutes = serializers.IntegerField(allow_null=True)
    resolution_minutes = serializers.IntegerField(allow_null=True)
    mtbf_minutes = serializers.FloatField(allow_null=True)
    incident_count = serializers.IntegerField()


class ChecklistHeatmapItemSerializer(serializers.Serializer):
    checklist_item = serializers.IntegerField()
    checklist_item_name = serializers.CharField()
    status = serializers.ChoiceField(choices=["done", "missed", "pending"])


class ChecklistHeatmapRowSerializer(serializers.Serializer):
    hourly_slot = serializers.IntegerField()
    slot_index = serializers.IntegerField()
    items = ChecklistHeatmapItemSerializer(many=True)


class BreakdownCauseSerializer(serializers.ModelSerializer):
    class Meta:
        model = BreakdownCause
        fields = ("id", "name", "code", "is_other", "active")

    def validate_is_other(self, value):
        # The model docstring's "exactly one row should have is_other=True"
        # invariant was previously unenforced — nothing stopped an Admin
        # from creating a second "Other" cause, which wouldn't break the
        # free-text-required checks (those key off the selected cause's own
        # is_other, not a singleton lookup) but would show two indistinguishable
        # "Other" options in every cause picker.
        if value:
            existing = BreakdownCause.objects.filter(is_other=True)
            if self.instance is not None:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError(
                    f'"{existing.first().name}" is already the Other cause — only one is allowed.'
                )
        return value


class ChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistItem
        fields = ("id", "name", "code", "description", "active")


class HourlySlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = HourlySlot
        fields = ("id", "site", "slot_index", "start_time", "end_time", "active")


class HourlyChecklistEntrySerializer(serializers.ModelSerializer):
    shift_instance = serializers.PrimaryKeyRelatedField(queryset=ShiftInstance.objects.all(), required=False)

    class Meta:
        model = HourlyChecklistEntry
        fields = (
            "id",
            "shift_instance",
            "site",
            "crusher",
            "hourly_slot",
            "slot_start_at",
            "slot_end_at",
            "checklist_item",
            "is_completed",
            "notes",
            "operator",
            "recorded_by",
            "status",
            "source",
            "client_uuid",
        )
        read_only_fields = ("site", "slot_start_at", "slot_end_at", "operator", "recorded_by")
        # See entries.serializers.ProductionEntrySerializer.Meta.validators
        # for why the auto UniqueTogetherValidator is disabled here too.
        validators = []

    def validate(self, attrs):
        request = self.context["request"]
        crusher = attrs.get("crusher") or getattr(self.instance, "crusher", None)
        services.validate_crusher_machine(crusher)
        attrs["site"] = crusher.site

        shift_instance = attrs.get("shift_instance") or get_or_create_open_instance(crusher.site)
        if shift_instance is None:
            raise serializers.ValidationError({"detail": "No open shift covers the current time for this site."})
        attrs["shift_instance"] = shift_instance

        hourly_slot = attrs.get("hourly_slot") or getattr(self.instance, "hourly_slot", None)
        if hourly_slot is None:
            raise serializers.ValidationError({"hourly_slot": "Required."})
        attrs["slot_start_at"], attrs["slot_end_at"] = services.resolve_slot_datetimes(hourly_slot, shift_instance)

        attrs["operator"] = attrs.get("operator") or request.user
        attrs["recorded_by"] = request.user

        entries_services.enforce_shift_window(shift_instance, request.user)
        entries_services.enforce_status_change_permission(self.instance, attrs.get("status"), request.user)
        return attrs

    def create(self, validated_data):
        try:
            return HourlyChecklistEntry.objects.create(**validated_data)
        except IntegrityError:
            _conflict("A checklist entry already exists for this crusher/slot/item in this shift instance.")

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class HourlyBreakdownEntrySerializer(serializers.ModelSerializer):
    shift_instance = serializers.PrimaryKeyRelatedField(queryset=ShiftInstance.objects.all(), required=False)

    class Meta:
        model = HourlyBreakdownEntry
        fields = (
            "id",
            "shift_instance",
            "site",
            "crusher",
            "hourly_slot",
            "slot_start_at",
            "slot_end_at",
            "causes",
            "other_cause_text",
            "downtime_minutes",
            "comments",
            "operator",
            "recorded_by",
            "status",
            "source",
            "client_uuid",
        )
        read_only_fields = ("site", "slot_start_at", "slot_end_at", "operator", "recorded_by")
        validators = []

    def validate(self, attrs):
        request = self.context["request"]
        crusher = attrs.get("crusher") or getattr(self.instance, "crusher", None)
        services.validate_crusher_machine(crusher)
        attrs["site"] = crusher.site

        shift_instance = attrs.get("shift_instance") or get_or_create_open_instance(crusher.site)
        if shift_instance is None:
            raise serializers.ValidationError({"detail": "No open shift covers the current time for this site."})
        attrs["shift_instance"] = shift_instance

        hourly_slot = attrs.get("hourly_slot") or getattr(self.instance, "hourly_slot", None)
        if hourly_slot is None:
            raise serializers.ValidationError({"hourly_slot": "Required."})
        attrs["slot_start_at"], attrs["slot_end_at"] = services.resolve_slot_datetimes(hourly_slot, shift_instance)

        causes = attrs.get("causes")
        if causes and any(c.is_other for c in causes) and not attrs.get("other_cause_text"):
            raise serializers.ValidationError(
                {"other_cause_text": "Required when the 'Other' cause is selected."}
            )

        attrs["operator"] = attrs.get("operator") or request.user
        attrs["recorded_by"] = request.user

        entries_services.enforce_shift_window(shift_instance, request.user)
        entries_services.enforce_status_change_permission(self.instance, attrs.get("status"), request.user)
        return attrs

    def create(self, validated_data):
        causes = validated_data.pop("causes", [])
        try:
            entry = HourlyBreakdownEntry.objects.create(**validated_data)
        except IntegrityError:
            _conflict("A breakdown-matrix entry already exists for this crusher/slot in this shift instance.")
        if causes:
            entry.causes.set(causes)
        return entry

    def update(self, instance, validated_data):
        causes = validated_data.pop("causes", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if causes is not None:
            instance.causes.set(causes)
        return instance


class BreakdownIncidentSerializer(serializers.ModelSerializer):
    attend_minutes = serializers.ReadOnlyField()
    repair_minutes = serializers.ReadOnlyField()
    resolution_minutes = serializers.ReadOnlyField()
    # Non-nullable on the model but server-derived (defaults to now) on
    # create, so it must be optional from the client.
    time_reported = serializers.DateTimeField(required=False)

    class Meta:
        model = BreakdownIncident
        fields = (
            "id",
            "site",
            "section",
            "crusher",
            "shift_instance",
            "time_occurred",
            "time_reported",
            "time_attended",
            "time_completed",
            "artisan",
            "cause",
            "cause_other_text",
            "description",
            "root_cause_of_failure",
            "remedial_action_taken",
            "severity",
            "status",
            "reported_by",
            "recorded_by",
            "source",
            "client_uuid",
            "comments",
            "attend_minutes",
            "repair_minutes",
            "resolution_minutes",
        )
        # artisan is read-only here on purpose: it's only ever set through
        # the Supervisor+-only /assign action (views.py), which also
        # validates the artisan is a maintenance_technician, transitions
        # status open->in_progress, and writes an audit-log event — a
        # direct PATCH here (which the reporting Operator can otherwise
        # make while status=="open", per CanWriteBreakdownIncident) would
        # silently bypass all of that.
        read_only_fields = ("site", "status", "artisan", "reported_by", "recorded_by")

    def validate(self, attrs):
        request = self.context["request"]
        crusher = attrs.get("crusher") or getattr(self.instance, "crusher", None)
        services.validate_crusher_machine(crusher)
        attrs["site"] = crusher.site
        attrs["section"] = attrs.get("section") or crusher.current_section

        if self.instance is None:
            attrs["shift_instance"] = attrs.get("shift_instance") or get_or_create_open_instance(crusher.site)
            attrs["time_reported"] = attrs.get("time_reported") or timezone.now()
            attrs["reported_by"] = request.user
        attrs["recorded_by"] = request.user

        artisan = attrs.get("artisan")
        if artisan is not None and not artisan.maintenance_technician:
            raise serializers.ValidationError({"artisan": "User is not flagged as a maintenance technician."})

        cause = attrs.get("cause") or getattr(self.instance, "cause", None)
        if cause is not None and cause.is_other and not attrs.get("cause_other_text", getattr(self.instance, "cause_other_text", "")):
            raise serializers.ValidationError({"cause_other_text": "Required when the 'Other' cause is selected."})

        return attrs

    def create(self, validated_data):
        return BreakdownIncident.objects.create(**validated_data)

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class BreakdownIncidentAssignSerializer(serializers.Serializer):
    artisan = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.filter(is_active=True))

    def validate_artisan(self, user):
        if not user.maintenance_technician:
            raise serializers.ValidationError("User is not flagged as a maintenance technician.")
        return user


class BreakdownIncidentResolveSerializer(serializers.Serializer):
    root_cause_of_failure = serializers.CharField()
    remedial_action_taken = serializers.CharField()
    time_completed = serializers.DateTimeField(required=False)


class ShiftCrushingSummarySerializer(serializers.ModelSerializer):
    shift_instance = serializers.PrimaryKeyRelatedField(queryset=ShiftInstance.objects.all(), required=False)

    class Meta:
        model = ShiftCrushingSummary
        fields = (
            "id",
            "shift_instance",
            "site",
            "crusher",
            "crushing_time_minutes",
            "down_time_minutes",
            "crushed_tonnage",
            "stoppage_instances",
            "availability_pct",
            "comments",
            "status",
            "recorded_by",
            "source",
            "client_uuid",
        )
        read_only_fields = (
            "site",
            "down_time_minutes",
            "crushed_tonnage",
            "stoppage_instances",
            "availability_pct",
            "recorded_by",
        )
        validators = []

    def validate(self, attrs):
        request = self.context["request"]
        crusher = attrs.get("crusher") or getattr(self.instance, "crusher", None)
        services.validate_crusher_machine(crusher)
        attrs["site"] = crusher.site
        attrs["shift_instance"] = attrs.get("shift_instance") or get_or_create_open_instance(crusher.site)
        if attrs["shift_instance"] is None:
            raise serializers.ValidationError({"detail": "No open shift covers the current time for this site."})
        attrs["recorded_by"] = request.user
        entries_services.enforce_status_change_permission(self.instance, attrs.get("status"), request.user)
        return attrs

    def create(self, validated_data):
        try:
            summary = ShiftCrushingSummary.objects.create(**validated_data)
        except IntegrityError:
            _conflict("A crushing summary already exists for this crusher in this shift instance.")
        services.recompute_shift_crushing_summary(summary)
        return summary

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        services.recompute_shift_crushing_summary(instance)
        return instance
