from rest_framework.routers import DefaultRouter

from .views import BreakdownLogViewSet, DeliveryEntryViewSet, ProductionEntryViewSet

router = DefaultRouter()
router.register("production-entries", ProductionEntryViewSet, basename="productionentry")
router.register("breakdown-logs", BreakdownLogViewSet, basename="breakdownlog")
router.register("delivery-entries", DeliveryEntryViewSet, basename="deliveryentry")

urlpatterns = router.urls
