from rest_framework import serializers

from .models import (
    DeliveryDestination,
    DowntimeReasonCode,
    MachineType,
    Parameter,
    ParameterChoice,
    Section,
    Site,
    UOM,
)


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ("id", "name", "code", "timezone", "active", "created_at", "updated_at")
        extra_kwargs = {"code": {"help_text": "Auto-generated from name if left blank."}}


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ("id", "site", "name", "code", "active", "created_at", "updated_at")
        extra_kwargs = {"code": {"help_text": "Auto-generated from name if left blank."}}
        # DRF auto-generates a UniqueTogetherValidator from the model's
        # UniqueConstraint(fields=["site","code"]) and, to support it,
        # force-marks every field in that set as required=True — including
        # `code`, which is blank=True on the model precisely so it's
        # optional (auto-slugified in Section.save() otherwise). Same issue
        # fixed this session in several other serializers; disabled here
        # too, relying on the IntegrityError -> clean 400 handling in the
        # view for a genuine duplicate (site, code) pair.
        validators = []


class MachineTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MachineType
        fields = ("id", "name", "code", "description", "active", "created_at", "updated_at")


class UOMSerializer(serializers.ModelSerializer):
    class Meta:
        model = UOM
        fields = ("id", "name", "abbreviation")


class ParameterChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParameterChoice
        fields = ("id", "value", "label")


class ParameterSerializer(serializers.ModelSerializer):
    choices = ParameterChoiceSerializer(many=True, read_only=True)

    class Meta:
        model = Parameter
        fields = (
            "id",
            "name",
            "code",
            "uom",
            "applicable_machine_types",
            "section",
            "scope",
            "data_type",
            "aggregation",
            "min_value",
            "max_value",
            "is_required",
            "active",
            "choices",
        )

    def validate(self, attrs):
        scope = attrs.get("scope", getattr(self.instance, "scope", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        if scope == Parameter.SCOPE_SECTION and section is None:
            raise serializers.ValidationError(
                {"section": "Required when scope is 'section'."}
            )
        data_type = attrs.get("data_type", getattr(self.instance, "data_type", None))
        if data_type != Parameter.DATA_TYPE_SELECT and self.initial_data.get("choices"):
            raise serializers.ValidationError(
                {"choices": "Choices are only valid for data_type='select'."}
            )
        return attrs


class DeliveryDestinationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryDestination
        fields = ("id", "site", "name", "code", "active")


class DowntimeReasonCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DowntimeReasonCode
        fields = ("id", "code", "description", "category", "active")
