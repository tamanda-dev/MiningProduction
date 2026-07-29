import django_filters

from .models import BreakdownLog, DeliveryEntry, ProductionEntry

# date_from/date_to filter on the *date part* of a DateTimeField
# (lookup_expr="date__gte"/"date__lte"), not the field's raw gte/lte —
# a plain gte/lte on a DateTimeField compares against midnight of that
# date, which would silently exclude nearly everything on the "to" date
# (only exact-midnight rows would match). The __date transform sidesteps
# that entirely: "to 2026-07-29" genuinely means the whole day.


class ProductionEntryFilterSet(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="slot_start_at", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="slot_start_at", lookup_expr="date__lte")

    class Meta:
        model = ProductionEntry
        fields = ("site", "section", "machine", "shift_instance", "entry_type", "status")


class BreakdownLogFilterSet(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="start_at", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="start_at", lookup_expr="date__lte")

    class Meta:
        model = BreakdownLog
        fields = ("site", "section", "machine", "shift_instance", "reason_code", "status")


class DeliveryEntryFilterSet(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="slot_start_at", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="slot_start_at", lookup_expr="date__lte")

    class Meta:
        model = DeliveryEntry
        fields = ("site", "section", "delivery_destination", "shift_instance", "status")
