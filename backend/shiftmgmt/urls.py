from rest_framework.routers import DefaultRouter

from .views import ShiftInstanceViewSet, ShiftViewSet

router = DefaultRouter()
router.register("shifts", ShiftViewSet, basename="shift")
router.register("shift-instances", ShiftInstanceViewSet, basename="shiftinstance")

urlpatterns = router.urls
