from rest_framework.routers import DefaultRouter

from .views import MachineAssignmentViewSet, MachineTypeQualificationViewSet, MachineViewSet

router = DefaultRouter()
router.register("machines", MachineViewSet, basename="machine")
router.register("machine-qualifications", MachineTypeQualificationViewSet, basename="machinequalification")
router.register("machine-assignments", MachineAssignmentViewSet, basename="machineassignment")

urlpatterns = router.urls
