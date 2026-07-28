from django.contrib.auth import get_user_model
from rest_framework import serializers

from masterdata.models import Section, SubSection

from .models import Machine, MachineAssignment, MachineTypeQualification


class MachineSerializer(serializers.ModelSerializer):
    machine_type_code = serializers.CharField(source="machine_type.code", read_only=True)

    class Meta:
        model = Machine
        fields = (
            "id",
            "machine_type",
            "machine_type_code",
            "site",
            "fleet_number",
            "name",
            "status",
            "current_section",
        )


class MachineTypeQualificationSerializer(serializers.ModelSerializer):
    machine_fleet_number = serializers.CharField(source="machine.fleet_number", read_only=True)
    machine_type_code = serializers.CharField(source="machine_type.code", read_only=True)

    class Meta:
        model = MachineTypeQualification
        fields = ("id", "user", "machine", "machine_fleet_number", "machine_type", "machine_type_code", "site", "active")
        # machine_type/site are the model's real granting dimensions (see
        # _check_qualified), but the "assign a specific machine" UI only
        # ever supplies `machine` — auto-derived below — so neither is
        # required from the client. Still accepted directly for the older
        # "qualified for this whole type, optionally at one site" grant
        # shape (seed scripts, direct API use).
        extra_kwargs = {"machine_type": {"required": False}}
        # DRF auto-generates a UniqueTogetherValidator from the model's
        # UniqueConstraint(fields=["user","machine_type","site","machine"])
        # and, to support it, force-marks every field in that set as
        # required=True — including site/machine_type, which this
        # serializer deliberately leaves optional (same issue already fixed
        # this session in ProductionEntrySerializer/UserSiteAccessSerializer).
        # Disabled here too; a genuine duplicate grant surfaces as a plain
        # IntegrityError, caught in the view for a clean 400 instead.
        validators = []

    def validate(self, attrs):
        machine = attrs.get("machine") or getattr(self.instance, "machine", None)
        if machine is not None:
            attrs["machine_type"] = machine.machine_type
            attrs["site"] = machine.site
        elif not attrs.get("machine_type") and not (self.instance and self.instance.machine_type_id):
            raise serializers.ValidationError(
                {"machine": "Either machine (a specific unit) or machine_type is required."}
            )
        return attrs


class MachineAssignmentSerializer(serializers.ModelSerializer):
    machine_label = serializers.CharField(source="machine.__str__", read_only=True)
    operator_label = serializers.CharField(source="operator.__str__", read_only=True)

    class Meta:
        model = MachineAssignment
        fields = (
            "id",
            "machine",
            "machine_label",
            "operator",
            "operator_label",
            "shift_instance",
            "section",
            "sub_section",
            "started_at",
            "ended_at",
            "status",
            "handed_over_from",
            "release_reason",
        )
        read_only_fields = fields


class ActivateMachineSerializer(serializers.Serializer):
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    sub_section = serializers.PrimaryKeyRelatedField(
        queryset=SubSection.objects.all(), required=False, allow_null=True
    )


class AssignMachineSerializer(serializers.Serializer):
    """Like ActivateMachineSerializer, but a Supervisor+ names the operator
    instead of it being implicitly request.user — the push-assignment
    counterpart to an operator self-activating their own machine.
    """

    operator = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.filter(is_active=True))
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    sub_section = serializers.PrimaryKeyRelatedField(
        queryset=SubSection.objects.all(), required=False, allow_null=True
    )


class ReleaseMachineSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class HandoverMachineSerializer(serializers.Serializer):
    new_operator = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.all())
    section = serializers.PrimaryKeyRelatedField(
        queryset=Section.objects.all(), required=False, allow_null=True
    )
    sub_section = serializers.PrimaryKeyRelatedField(
        queryset=SubSection.objects.all(), required=False, allow_null=True
    )
