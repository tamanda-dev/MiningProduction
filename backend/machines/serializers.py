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
    class Meta:
        model = MachineTypeQualification
        fields = ("id", "user", "machine_type", "site", "active")


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
