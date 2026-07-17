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
    shift_instance = serializers.IntegerField()


class ExportStatusSerializer(serializers.Serializer):
    task_id = serializers.CharField()
    status = serializers.CharField()
    download_url = serializers.CharField(required=False)
    error = serializers.CharField(required=False)
