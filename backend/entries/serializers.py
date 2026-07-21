from django.db import IntegrityError
from rest_framework import serializers

from machines.models import MachineAssignment
from masterdata.models import Section
from shiftmgmt.models import ShiftInstance
from shiftmgmt.services import get_or_create_open_instance

from . import services
from .models import BreakdownLog, CrusherEntry, DeliveryEntry, ParameterValue, ProductionEntry


def _conflict(detail):
    raise serializers.ValidationError({"detail": detail, "code": "slot_conflict"})


class ParameterValueInSerializer(serializers.Serializer):
    parameter = serializers.CharField()  # accepts either a Parameter id or its `code`
    value = serializers.JSONField()


class ParameterValueOutSerializer(serializers.ModelSerializer):
    parameter_code = serializers.CharField(source="parameter.code", read_only=True)
    parameter_name = serializers.CharField(source="parameter.name", read_only=True)
    value = serializers.SerializerMethodField()

    class Meta:
        model = ParameterValue
        fields = ("parameter", "parameter_code", "parameter_name", "value")

    def get_value(self, obj):
        if obj.value_number is not None:
            return obj.value_number
        if obj.value_boolean is not None:
            return obj.value_boolean
        return obj.value_text


class ProductionEntrySerializer(serializers.ModelSerializer):
    values = ParameterValueInSerializer(many=True, write_only=True)
    values_display = ParameterValueOutSerializer(source="values", many=True, read_only=True)
    override_reason = serializers.CharField(required=False, allow_blank=True, write_only=True)
    # Non-nullable on the model, but only *required from the client* on the
    # section-level path (no machine_assignment) — derived server-side
    # otherwise, so both must be explicitly optional here.
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), required=False)
    shift_instance = serializers.PrimaryKeyRelatedField(queryset=ShiftInstance.objects.all(), required=False)

    class Meta:
        model = ProductionEntry
        fields = (
            "id",
            "shift_instance",
            "site",
            "section",
            "sub_section",
            "machine",
            "machine_assignment",
            "entry_type",
            "slot_index",
            "slot_start_at",
            "slot_end_at",
            "operator",
            "recorded_by",
            "comments",
            "status",
            "source",
            "client_uuid",
            "override_reason",
            "values",
            "values_display",
        )
        read_only_fields = ("site", "slot_start_at", "slot_end_at", "operator", "recorded_by")
        # DRF auto-generates a UniqueTogetherValidator from the model's
        # partial UniqueConstraints (uniq_hourly_slot/uniq_shift_total) and,
        # to support it, force-marks "machine"/"slot_index" required=True
        # even though they're blank=True — and the validator itself doesn't
        # understand our `condition=Q(entry_type=...)` partial semantics, so
        # it would reject valid combinations anyway. We disable it and rely
        # on the IntegrityError -> clean 400 handling in create() instead,
        # which does respect the partial condition.
        validators = []

    def validate(self, attrs):
        request = self.context["request"]
        machine_assignment = attrs.get("machine_assignment") or getattr(self.instance, "machine_assignment", None)
        entry_type = attrs.get("entry_type", getattr(self.instance, "entry_type", None))
        slot_index = attrs.get("slot_index", getattr(self.instance, "slot_index", None))

        if machine_assignment is not None:
            if machine_assignment.status != MachineAssignment.STATUS_ACTIVE and self.instance is None:
                raise serializers.ValidationError(
                    {"machine_assignment": "Assignment is not active."}
                )
            attrs["machine"] = machine_assignment.machine
            attrs["section"] = machine_assignment.section
            attrs["sub_section"] = machine_assignment.sub_section
            attrs["shift_instance"] = machine_assignment.shift_instance
            attrs["site"] = machine_assignment.machine.site
            attrs["operator"] = machine_assignment.operator
        else:
            section = attrs.get("section") or getattr(self.instance, "section", None)
            if section is None:
                raise serializers.ValidationError(
                    {"section": "Required when not submitting via an active machine_assignment."}
                )
            attrs["site"] = section.site
            attrs["shift_instance"] = attrs.get("shift_instance") or get_or_create_open_instance(section.site)
            if attrs["shift_instance"] is None:
                raise serializers.ValidationError(
                    {"shift_instance": "No open shift covers the current time for this section's site."}
                )
            attrs["operator"] = attrs.get("operator") or request.user

        if entry_type == ProductionEntry.ENTRY_TYPE_HOURLY:
            if slot_index is None:
                raise serializers.ValidationError({"slot_index": "Required for hourly entries."})
            start, end = services.resolve_slot_datetimes(attrs["shift_instance"], slot_index)
            attrs["slot_start_at"], attrs["slot_end_at"] = start, end
        else:
            attrs["slot_index"] = None
            attrs["slot_start_at"] = None
            attrs["slot_end_at"] = None

        services.enforce_shift_window(attrs["shift_instance"], request.user, attrs.get("override_reason", ""))
        services.enforce_status_change_permission(self.instance, attrs.get("status"), request.user)
        attrs["recorded_by"] = request.user
        return attrs

    def create(self, validated_data):
        values = validated_data.pop("values")
        validated_data.pop("override_reason", None)
        try:
            entry = ProductionEntry.objects.create(**validated_data)
        except IntegrityError:
            _conflict("An entry already exists for this machine/section/slot in this shift instance.")
        services.set_parameter_values("production_entry", entry, values)
        return entry

    def update(self, instance, validated_data):
        values = validated_data.pop("values", None)
        validated_data.pop("override_reason", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        try:
            instance.save()
        except IntegrityError:
            _conflict("An entry already exists for this machine/section/slot in this shift instance.")
        if values is not None:
            services.set_parameter_values("production_entry", instance, values)
        return instance


class BreakdownLogSerializer(serializers.ModelSerializer):
    values = ParameterValueInSerializer(many=True, write_only=True, required=False)
    values_display = ParameterValueOutSerializer(source="values", many=True, read_only=True)
    override_reason = serializers.CharField(required=False, allow_blank=True, write_only=True)
    # Non-nullable on the model but optional from the client — defaults to
    # the machine's current_section (set by the activation flow) when omitted.
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), required=False)

    class Meta:
        model = BreakdownLog
        fields = (
            "id",
            "shift_instance",
            "site",
            "section",
            "machine",
            "machine_assignment",
            "reason_code",
            "description",
            "slot_index",
            "slot_start_at",
            "slot_end_at",
            "start_at",
            "end_at",
            "duration_minutes",
            "severity",
            "operator",
            "recorded_by",
            "comments",
            "status",
            "source",
            "client_uuid",
            "override_reason",
            "values",
            "values_display",
        )
        read_only_fields = ("site", "shift_instance", "duration_minutes", "operator", "recorded_by")

    def validate(self, attrs):
        request = self.context["request"]
        machine = attrs.get("machine") or getattr(self.instance, "machine", None)
        section = attrs.get("section") or getattr(self.instance, "section", None)

        attrs["site"] = machine.site
        shift_instance = get_or_create_open_instance(machine.site)
        if shift_instance is None:
            raise serializers.ValidationError({"detail": "No open shift covers the current time for this site."})
        attrs["shift_instance"] = shift_instance
        attrs["section"] = section or machine.current_section
        if attrs["section"] is None:
            raise serializers.ValidationError({"section": "Required (machine has no current_section set)."})

        machine_assignment = MachineAssignment.objects.filter(
            machine=machine, operator=request.user, status=MachineAssignment.STATUS_ACTIVE
        ).first()
        attrs["machine_assignment"] = machine_assignment
        attrs["operator"] = machine_assignment.operator if machine_assignment else request.user
        attrs["recorded_by"] = request.user

        services.enforce_shift_window(shift_instance, request.user, attrs.get("override_reason", ""))
        services.enforce_status_change_permission(self.instance, attrs.get("status"), request.user)
        return attrs

    def create(self, validated_data):
        values = validated_data.pop("values", [])
        validated_data.pop("override_reason", None)
        log = BreakdownLog.objects.create(**validated_data)
        if values:
            services.set_parameter_values("breakdown_log", log, values)
        services.apply_breakdown_side_effects(log)
        return log

    def update(self, instance, validated_data):
        values = validated_data.pop("values", None)
        validated_data.pop("override_reason", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if values is not None:
            services.set_parameter_values("breakdown_log", instance, values)
        services.apply_breakdown_side_effects(instance)
        return instance


class CrusherEntrySerializer(serializers.ModelSerializer):
    values = ParameterValueInSerializer(many=True, write_only=True, required=False)
    values_display = ParameterValueOutSerializer(source="values", many=True, read_only=True)
    override_reason = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = CrusherEntry
        fields = (
            "id",
            "shift_instance",
            "site",
            "crusher_unit",
            "section",
            "entry_type",
            "slot_index",
            "slot_start_at",
            "slot_end_at",
            "throughput_tonnes",
            "operator",
            "recorded_by",
            "comments",
            "status",
            "source",
            "client_uuid",
            "override_reason",
            "values",
            "values_display",
        )
        read_only_fields = ("site", "shift_instance", "slot_start_at", "slot_end_at", "operator", "recorded_by")
        # See ProductionEntrySerializer.Meta.validators for why this is disabled.
        validators = []

    def validate(self, attrs):
        request = self.context["request"]
        crusher_unit = attrs.get("crusher_unit") or getattr(self.instance, "crusher_unit", None)
        attrs["site"] = crusher_unit.site
        shift_instance = get_or_create_open_instance(crusher_unit.site)
        if shift_instance is None:
            raise serializers.ValidationError({"detail": "No open shift covers the current time for this site."})
        attrs["shift_instance"] = shift_instance
        attrs["operator"] = request.user
        attrs["recorded_by"] = request.user

        entry_type = attrs.get("entry_type", getattr(self.instance, "entry_type", "hourly"))
        slot_index = attrs.get("slot_index", getattr(self.instance, "slot_index", None))
        if entry_type == "hourly":
            if slot_index is None:
                raise serializers.ValidationError({"slot_index": "Required for hourly entries."})
            start, end = services.resolve_slot_datetimes(shift_instance, slot_index)
            attrs["slot_start_at"], attrs["slot_end_at"] = start, end
        else:
            attrs["slot_index"] = None
            attrs["slot_start_at"] = None
            attrs["slot_end_at"] = None

        services.enforce_shift_window(shift_instance, request.user, attrs.get("override_reason", ""))
        services.enforce_status_change_permission(self.instance, attrs.get("status"), request.user)
        return attrs

    def create(self, validated_data):
        values = validated_data.pop("values", [])
        validated_data.pop("override_reason", None)
        try:
            entry = CrusherEntry.objects.create(**validated_data)
        except IntegrityError:
            _conflict("An entry already exists for this crusher unit/slot in this shift instance.")
        if values:
            services.set_parameter_values("crusher_entry", entry, values)
        return entry

    def update(self, instance, validated_data):
        values = validated_data.pop("values", None)
        validated_data.pop("override_reason", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        try:
            instance.save()
        except IntegrityError:
            _conflict("An entry already exists for this crusher unit/slot in this shift instance.")
        if values is not None:
            services.set_parameter_values("crusher_entry", instance, values)
        return instance


class DeliveryEntrySerializer(serializers.ModelSerializer):
    values = ParameterValueInSerializer(many=True, write_only=True, required=False)
    values_display = ParameterValueOutSerializer(source="values", many=True, read_only=True)
    override_reason = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = DeliveryEntry
        fields = (
            "id",
            "shift_instance",
            "site",
            "delivery_destination",
            "section",
            "slot_index",
            "slot_start_at",
            "slot_end_at",
            "tonnes",
            "trip_count",
            "operator",
            "recorded_by",
            "comments",
            "status",
            "source",
            "client_uuid",
            "override_reason",
            "values",
            "values_display",
        )
        read_only_fields = ("site", "shift_instance", "slot_start_at", "slot_end_at", "operator", "recorded_by")

    def validate(self, attrs):
        request = self.context["request"]
        destination = attrs.get("delivery_destination") or getattr(self.instance, "delivery_destination", None)
        attrs["site"] = destination.site
        shift_instance = get_or_create_open_instance(destination.site)
        if shift_instance is None:
            raise serializers.ValidationError({"detail": "No open shift covers the current time for this site."})
        attrs["shift_instance"] = shift_instance
        attrs["operator"] = request.user
        attrs["recorded_by"] = request.user

        slot_index = attrs.get("slot_index", getattr(self.instance, "slot_index", None))
        if slot_index is not None:
            start, end = services.resolve_slot_datetimes(shift_instance, slot_index)
            attrs["slot_start_at"], attrs["slot_end_at"] = start, end

        services.enforce_shift_window(shift_instance, request.user, attrs.get("override_reason", ""))
        services.enforce_status_change_permission(self.instance, attrs.get("status"), request.user)
        return attrs

    def create(self, validated_data):
        values = validated_data.pop("values", [])
        validated_data.pop("override_reason", None)
        entry = DeliveryEntry.objects.create(**validated_data)
        if values:
            services.set_parameter_values("delivery_entry", entry, values)
        return entry

    def update(self, instance, validated_data):
        values = validated_data.pop("values", None)
        validated_data.pop("override_reason", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if values is not None:
            services.set_parameter_values("delivery_entry", instance, values)
        return instance
