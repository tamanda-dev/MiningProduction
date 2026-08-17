from django.urls import path

from .views import (
    DashboardAvailabilityView,
    DashboardDowntimeParetoView,
    DashboardExportStatusView,
    DashboardExportView,
    DashboardHourlyCurveView,
    DashboardHourlyMachineStatusView,
    DashboardLandingView,
    DashboardMachineStatusView,
    DashboardMttrView,
    DashboardProductionSummaryView,
    DashboardSummaryView,
    DashboardTrendsView,
)

urlpatterns = [
    path("landing/", DashboardLandingView.as_view(), name="dashboard-landing"),
    path("summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("trends/", DashboardTrendsView.as_view(), name="dashboard-trends"),
    path("hourly-curve/", DashboardHourlyCurveView.as_view(), name="dashboard-hourly-curve"),
    path("availability/", DashboardAvailabilityView.as_view(), name="dashboard-availability"),
    path("downtime-pareto/", DashboardDowntimeParetoView.as_view(), name="dashboard-downtime-pareto"),
    path("machine-status/", DashboardMachineStatusView.as_view(), name="dashboard-machine-status"),
    path(
        "hourly-machine-status/",
        DashboardHourlyMachineStatusView.as_view(),
        name="dashboard-hourly-machine-status",
    ),
    path("mttr/", DashboardMttrView.as_view(), name="dashboard-mttr"),
    path("production-summary/", DashboardProductionSummaryView.as_view(), name="dashboard-production-summary"),
    path("export/", DashboardExportView.as_view(), name="dashboard-export"),
    path("export/<str:task_id>/", DashboardExportStatusView.as_view(), name="dashboard-export-status"),
]
