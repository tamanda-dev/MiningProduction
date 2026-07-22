from rest_framework import serializers


class ActVsPlanRowSerializer(serializers.Serializer):
    section = serializers.IntegerField()
    section_name = serializers.CharField()
    parameter = serializers.IntegerField()
    parameter_code = serializers.CharField()
    parameter_name = serializers.CharField()
    uom = serializers.CharField(allow_null=True)
    act = serializers.DecimalField(max_digits=14, decimal_places=3)
    plan = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    var = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    pct_var = serializers.FloatField(allow_null=True)


class TrendPointSerializer(serializers.Serializer):
    date = serializers.CharField()
    act = serializers.DecimalField(max_digits=14, decimal_places=3)
    plan = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    var = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    pct_var = serializers.FloatField(allow_null=True)


class HourlyCurvePointSerializer(serializers.Serializer):
    slot_index = serializers.IntegerField()
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()
    cumulative_act = serializers.DecimalField(max_digits=14, decimal_places=3)
    cumulative_target = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)


class AvailabilityByShiftSerializer(serializers.Serializer):
    shift_name = serializers.CharField()
    availability_pct = serializers.FloatField(allow_null=True)
    utilization_pct = serializers.FloatField(allow_null=True)
    scheduled_minutes = serializers.DecimalField(max_digits=14, decimal_places=2)
    breakdown_minutes = serializers.DecimalField(max_digits=14, decimal_places=2)
    active_minutes = serializers.DecimalField(max_digits=14, decimal_places=2)


class AvailabilityAverageSerializer(serializers.Serializer):
    availability_pct = serializers.FloatField(allow_null=True)
    utilization_pct = serializers.FloatField(allow_null=True)


class AvailabilityRowSerializer(serializers.Serializer):
    machine_type = serializers.IntegerField()
    machine_type_name = serializers.CharField()
    by_shift = AvailabilityByShiftSerializer(many=True)
    average = AvailabilityAverageSerializer()


class DowntimeParetoRowSerializer(serializers.Serializer):
    reason_code = serializers.IntegerField(allow_null=True)
    description = serializers.CharField()
    category = serializers.CharField()
    count = serializers.IntegerField()
    total_minutes = serializers.IntegerField()


class MachineStatusRowSerializer(serializers.Serializer):
    machine = serializers.IntegerField()
    fleet_number = serializers.CharField()
    machine_type = serializers.IntegerField()
    machine_type_name = serializers.CharField()
    status = serializers.CharField()
    current_section = serializers.IntegerField(allow_null=True)
    operator = serializers.IntegerField(allow_null=True)
    operator_label = serializers.CharField(allow_null=True)
    assignment_started_at = serializers.DateTimeField(allow_null=True)


class ExportTriggerRequestSerializer(serializers.Serializer):
    report_type = serializers.ChoiceField(choices=["shift", "daily", "mtd", "daily_production"], default="shift")
    # Required for report_type="shift" only.
    shift_instance = serializers.IntegerField(required=False)
    # Required for report_type="daily"/"mtd"/"daily_production".
    site = serializers.IntegerField(required=False)
    date = serializers.DateField(required=False)  # "daily"/"daily_production": the day to report on
    year = serializers.IntegerField(required=False)  # "mtd"
    month = serializers.IntegerField(required=False, min_value=1, max_value=12)  # "mtd"

    def validate(self, attrs):
        report_type = attrs["report_type"]
        if report_type == "shift" and not attrs.get("shift_instance"):
            raise serializers.ValidationError({"shift_instance": "Required for report_type='shift'."})
        if report_type == "daily" and not (attrs.get("site") and attrs.get("date")):
            raise serializers.ValidationError({"detail": "site and date are required for report_type='daily'."})
        if report_type == "mtd" and not (attrs.get("site") and attrs.get("year") and attrs.get("month")):
            raise serializers.ValidationError({"detail": "site, year and month are required for report_type='mtd'."})
        if report_type == "daily_production" and not (attrs.get("site") and attrs.get("date")):
            raise serializers.ValidationError(
                {"detail": "site and date are required for report_type='daily_production'."}
            )
        return attrs


class ExportStatusSerializer(serializers.Serializer):
    task_id = serializers.CharField()
    status = serializers.CharField()
    download_url = serializers.CharField(required=False)
    error = serializers.CharField(required=False)
