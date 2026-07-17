from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BreakdownCauseViewSet,
    BreakdownIncidentViewSet,
    ChecklistItemViewSet,
    CrusherBreakdownParetoView,
    CrusherChecklistHeatmapView,
    CrusherMttrMtbfTrendView,
    CrusherPlantExportStatusView,
    CrusherPlantExportView,
    HourlyBreakdownEntryViewSet,
    HourlyChecklistEntryViewSet,
    HourlySlotViewSet,
    ShiftCrushingSummaryViewSet,
)

router = DefaultRouter()
router.register("breakdown-causes", BreakdownCauseViewSet, basename="breakdowncause")
router.register("checklist-items", ChecklistItemViewSet, basename="checklistitem")
router.register("hourly-slots", HourlySlotViewSet, basename="hourlyslot")
router.register("hourly-checklist-entries", HourlyChecklistEntryViewSet, basename="hourlychecklistentry")
router.register("hourly-breakdown-entries", HourlyBreakdownEntryViewSet, basename="hourlybreakdownentry")
router.register("breakdown-incidents", BreakdownIncidentViewSet, basename="breakdownincident")
router.register("shift-crushing-summaries", ShiftCrushingSummaryViewSet, basename="shiftcrushingsummary")

dashboard_urlpatterns = [
    path("breakdown-pareto/", CrusherBreakdownParetoView.as_view(), name="crusher-breakdown-pareto"),
    path("mttr-mtbf-trend/", CrusherMttrMtbfTrendView.as_view(), name="crusher-mttr-mtbf-trend"),
    path("checklist-heatmap/", CrusherChecklistHeatmapView.as_view(), name="crusher-checklist-heatmap"),
    path("export/", CrusherPlantExportView.as_view(), name="crusher-plant-export"),
    path("export/<str:task_id>/", CrusherPlantExportStatusView.as_view(), name="crusher-plant-export-status"),
]

urlpatterns = router.urls + [
    path("crusher-ops/dashboard/", include(dashboard_urlpatterns)),
]
