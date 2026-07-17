from rest_framework.routers import DefaultRouter

from .views import ShiftPatternViewSet, TeamMemberViewSet, TeamViewSet

router = DefaultRouter()
router.register("shift-patterns", ShiftPatternViewSet, basename="shiftpattern")
router.register("teams", TeamViewSet, basename="team")
router.register("team-members", TeamMemberViewSet, basename="teammember")

urlpatterns = router.urls
