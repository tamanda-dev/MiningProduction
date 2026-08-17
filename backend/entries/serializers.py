from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from machines.models import MachineAssignment
from masterdata.models import Parameter, Section
from shiftmgmt.models import ShiftInstance
from shiftmgmt.services import get_or_create_open_instance

from . import services
from .models import BreakdownLog, DeliveryEntry, ParameterValue, ProductionEntry


def _conflict(detail):
    raise serializers.ValidationError({"detail": detail, "code": "slot_conflict"})


def _refresh_crusher_summary_if_applicable(entry):
    """A crusher Machine's "Tonnes Crushed" figure is submitted through the
    ordinary Production Entry form like any other machine parameter — there
    is no separate crusher throughput screen (see crusher_ops.services).
    Local import: crusher_ops already imports from entries, so importing it
    back here at module level would cycle; importing inside the function
    (only reached for a crusher machine, i.e. rarely) does not.
    """
    if entry.machine_id and entry.machine.machine_type.code == "cru":
        from crusher_ops import services as crusher_ops_services

        crusher_ops_services.refresh_summary_for(entry.machine, entry.shift_instance, entry.recorded_by)


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
            # On an update, an omitted shift_instance/operator must fall
            # back to the row's own existing values, not be recomputed —
            # "recompute from what's open right now" is only correct at
            # create time. Recomputing on every update silently relocated
            # an edited entry to whatever shift instance happened to be
            # open *at edit time* (e.g. a supervisor correcting an old
            # entry days later moved it onto today's shift) and reassigned
            # operator to whoever was doing the editing — caught live via
            # the Production Entries "Edit" flow reassigning an operator's
            # entry to the supervisor who'd corrected it.
            attrs["shift_instance"] = (
                attrs.get("shift_instance")
                or getattr(self.instance, "shift_instance", None)
                or get_or_create_open_instance(section.site)
            )
            if attrs["shift_instance"] is None:
                raise serializers.ValidationError(
                    {"shift_instance": "No open shift covers the current time for this section's site."}
                )
            attrs["operator"] = attrs.get("operator") or getattr(self.instance, "operator", None) or request.user

        if entry_type == ProductionEntry.ENTRY_TYPE_HOURLY:
            if slot_index is None:
                raise serializers.ValidationError({"slot_index": "Required for hourly entries."})
            start, end = services.resolve_slot_datetimes(attrs["shift_instance"], slot_index)
            attrs["slot_start_at"], attrs["slot_end_at"] = start, end
        else:
            attrs["slot_index"] = None
            attrs["slot_start_at"] = None
            attrs["slot_end_at"] = None

        # A machine/section-scoped parameter (e.g. "Tonnes Hauled") is
        # measured per hour — its shift total is the *sum* of those hourly
        # entries (act_vs_plan_for_shift_instance already computes it that
        # way), never a second, separately-typed-in figure. Only
        # Parameter.SCOPE_SHIFT parameters ("Shift-total" in the model's
        # own choices) are legitimately entered once per shift. Without
        # this, nothing stopped an operator from also logging an hourly
        # parameter under entry_type='shift_total', silently double-
        # counting it in every Act total downstream.
        if entry_type == ProductionEntry.ENTRY_TYPE_SHIFT_TOTAL:
            for item in attrs.get("values", []):
                parameter = services.resolve_parameter(item["parameter"])
                if parameter.scope != Parameter.SCOPE_SHIFT:
                    raise serializers.ValidationError(
                        {
                            "values": (
                                f"'{parameter.name}' is tracked hourly — its shift total is computed "
                                "automatically from hourly entries, not entered separately."
                            )
                        }
                    )

        services.enforce_shift_window(attrs["shift_instance"], request.user, attrs.get("override_reason", ""))
        services.enforce_status_change_permission(self.instance, attrs.get("status"), request.user)
        attrs["recorded_by"] = request.user
        return attrs

    def create(self, validated_data):
        values = validated_data.pop("values")
        validated_data.pop("override_reason", None)
        try:
            # entry.create() and set_parameter_values() share one savepoint:
            # if the parameter values fail validation (bad code, out-of-
            # range, wrong type), the entry row itself must not survive
            # either — previously it did, leaving an orphaned entry with
            # zero values that still occupied its slot (blocking a
            # legitimate retry) and reported nothing in Act totals.
            with transaction.atomic():
                entry = ProductionEntry.objects.create(**validated_data)
                services.set_parameter_values("production_entry", entry, values)
        except IntegrityError:
            _conflict("An entry already exists for this machine/section/slot in this shift instance.")
        _refresh_crusher_summary_if_applicable(entry)
        return entry

    def update(self, instance, validated_data):
        values = validated_data.pop("values", None)
        validated_data.pop("override_reason", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        try:
            with transaction.atomic():
                instance.save()
                if values is not None:
                    services.set_parameter_values("production_entry", instance, values)
        except IntegrityError:
            _conflict("An entry already exists for this machine/section/slot in this shift instance.")
        _refresh_crusher_summary_if_applicable(instance)
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
            "artisan",
            "repair_status",
            "acknowledged_at",
            "confirmed_at",
            "comments",
            "status",
            "source",
            "client_uuid",
            "override_reason",
            "values",
            "values_display",
        )
        # start_at/end_at/artisan/repair_status/acknowledged_at/confirmed_at
        # are all read-only here — start_at is server-stamped at report
        # time (below) and end_at only ever gets set by
        # complete_breakdown_repair(); the repair-workflow fields only ever
        # move through BreakdownLogViewSet's acknowledge/complete/confirm
        # actions (see entries/services.py), never a generic PATCH — that's
        # the only way the reported->acknowledged->fixed->confirmed order
        # can actually be enforced.
        read_only_fields = (
            "site",
            "shift_instance",
            "start_at",
            "end_at",
            "duration_minutes",
            "operator",
            "recorded_by",
            "artisan",
            "repair_status",
            "acknowledged_at",
            "confirmed_at",
        )

    def validate(self, attrs):
        request = self.context["request"]
        machine = attrs.get("machine") or getattr(self.instance, "machine", None)
        section = attrs.get("section") or getattr(self.instance, "section", None)

        attrs["site"] = machine.site
        # shift_instance/machine_assignment/operator are all read-only (the
        # client never submits them), so on an update they must come from
        # the existing row — recomputing them unconditionally on every
        # save (as this used to) silently relocated an edited entry onto
        # whatever shift instance happened to be open *at edit time* and
        # reassigned operator to whoever was editing, once the original
        # operator's machine_assignment had ended. Only a create (no
        # self.instance yet) should derive these fresh.
        if self.instance is not None:
            shift_instance = self.instance.shift_instance
            attrs["machine_assignment"] = self.instance.machine_assignment
            attrs["operator"] = self.instance.operator
        else:
            shift_instance = get_or_create_open_instance(machine.site)
            if shift_instance is None:
                raise serializers.ValidationError({"detail": "No open shift covers the current time for this site."})
            machine_assignment = MachineAssignment.objects.filter(
                machine=machine, operator=request.user, status=MachineAssignment.STATUS_ACTIVE
            ).first()
            attrs["machine_assignment"] = machine_assignment
            attrs["operator"] = machine_assignment.operator if machine_assignment else request.user
            # Server clock, not client input — a field device's clock can
            # be wrong or unsynced, and this is the start of the very
            # downtime window the Artisan workflow measures.
            attrs["start_at"] = timezone.now()
        attrs["shift_instance"] = shift_instance
        attrs["section"] = section or machine.current_section
        if attrs["section"] is None:
            raise serializers.ValidationError({"section": "Required (machine has no current_section set)."})

        attrs["recorded_by"] = request.user

        services.enforce_shift_window(shift_instance, request.user, attrs.get("override_reason", ""))
        services.enforce_status_change_permission(self.instance, attrs.get("status"), request.user)
        return attrs

    def create(self, validated_data):
        values = validated_data.pop("values", [])
        validated_data.pop("override_reason", None)
        # Parent row + parameter values + the machine.status side effect all
        # share one savepoint — a values validation failure must not leave
        # an orphaned, empty BreakdownLog behind (see ProductionEntry's
        # create() for the full rationale).
        with transaction.atomic():
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
        with transaction.atomic():
            instance.save()
            if values is not None:
                services.set_parameter_values("breakdown_log", instance, values)
            services.apply_breakdown_side_effects(instance)
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
        # DRF auto-generates a UniqueTogetherValidator from the model's
        # UniqueConstraint(fields=["shift_instance","delivery_destination","slot_index"])
        # and, to support it, force-marks every field in that set as
        # required=True — including slot_index, which is blank=True on the
        # model precisely so a delivery can be logged without picking one.
        # Same footgun fixed elsewhere this session (ProductionEntrySerializer
        # et al.); disabled here too, relying on the IntegrityError -> clean
        # 400 handling in create()/update() for a genuine duplicate.
        validators = []

    def validate(self, attrs):
        request = self.context["request"]
        destination = attrs.get("delivery_destination") or getattr(self.instance, "delivery_destination", None)
        attrs["site"] = destination.site
        # shift_instance/operator are read-only, so on an update they must
        # come from the existing row, not be recomputed — recomputing
        # unconditionally on every save (as this used to) silently
        # relocated an edited entry onto whatever shift instance happened
        # to be open *at edit time* and reassigned operator to whoever was
        # editing. Same fix applied to ProductionEntrySerializer and
        # BreakdownLogSerializer above.
        if self.instance is not None:
            shift_instance = self.instance.shift_instance
            attrs["operator"] = self.instance.operator
        else:
            shift_instance = get_or_create_open_instance(destination.site)
            if shift_instance is None:
                raise serializers.ValidationError({"detail": "No open shift covers the current time for this site."})
            attrs["operator"] = request.user
        attrs["shift_instance"] = shift_instance
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
        try:
            with transaction.atomic():
                entry = DeliveryEntry.objects.create(**validated_data)
                if values:
                    services.set_parameter_values("delivery_entry", entry, values)
        except IntegrityError:
            _conflict("An entry already exists for this destination/slot in this shift instance.")
        return entry

    def update(self, instance, validated_data):
        values = validated_data.pop("values", None)
        validated_data.pop("override_reason", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        try:
            with transaction.atomic():
                instance.save()
                if values is not None:
                    services.set_parameter_values("delivery_entry", instance, values)
        except IntegrityError:
            _conflict("An entry already exists for this destination/slot in this shift instance.")
        return instance
