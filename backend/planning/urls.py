from rest_framework.routers import DefaultRouter

from .views import PlanTargetViewSet

router = DefaultRouter()
router.register("plan-targets", PlanTargetViewSet, basename="plantarget")

urlpatterns = router.urls
