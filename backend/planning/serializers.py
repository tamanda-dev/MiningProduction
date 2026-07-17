from rest_framework import serializers

from .models import PlanTarget


class PlanTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanTarget
        fields = (
            "id",
            "parameter",
            "site",
            "section",
            "machine",
            "period_type",
            "shift_instance",
            "period_date",
            "target_value",
        )

    def validate(self, attrs):
        section = attrs.get("section", getattr(self.instance, "section", None))
        machine = attrs.get("machine", getattr(self.instance, "machine", None))

        if section is None and machine is None:
            raise serializers.ValidationError(
                {"section": "Either section or machine is required."}
            )
        # Deliberately not enforced: parameter.scope == "machine" does NOT
        # require `machine` to be set here. Source Excel reports set
        # section-level aggregate targets (e.g. total tonnes hauled by all
        # trucks in a section) even for machine-level parameters, alongside
        # optional per-machine targets — both are valid.

        period_type = attrs.get("period_type", getattr(self.instance, "period_type", None))
        shift_instance = attrs.get("shift_instance", getattr(self.instance, "shift_instance", None))
        period_date = attrs.get("period_date", getattr(self.instance, "period_date", None))
        if period_type == PlanTarget.PERIOD_SHIFT and shift_instance is None:
            raise serializers.ValidationError({"shift_instance": "Required when period_type='shift'."})
        if period_type in (PlanTarget.PERIOD_DAY, PlanTarget.PERIOD_MONTH) and period_date is None:
            raise serializers.ValidationError({"period_date": "Required when period_type is 'day' or 'month'."})

        return attrs
