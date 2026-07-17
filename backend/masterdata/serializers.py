from rest_framework import serializers

from .models import (
    CrusherUnit,
    DeliveryDestination,
    DowntimeReasonCode,
    MachineType,
    Parameter,
    ParameterChoice,
    Section,
    Site,
    SubSection,
    UOM,
)


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ("id", "name", "code", "timezone", "active", "created_at", "updated_at")


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ("id", "site", "name", "code", "active", "created_at", "updated_at")


class SubSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubSection
        fields = ("id", "section", "name", "code", "active", "display_order", "created_at", "updated_at")


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
        fields = ("id", "value", "label", "display_order")


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
            "min_value",
            "max_value",
            "is_required",
            "display_order",
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


class CrusherUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = CrusherUnit
        fields = ("id", "site", "name", "code", "active")


class DeliveryDestinationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryDestination
        fields = ("id", "site", "name", "code", "active")


class DowntimeReasonCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DowntimeReasonCode
        fields = ("id", "code", "description", "category", "active")
