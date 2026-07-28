from rest_framework.routers import DefaultRouter

from .views import (
    CrusherUnitViewSet,
    DeliveryDestinationViewSet,
    DowntimeReasonCodeViewSet,
    MachineTypeViewSet,
    ParameterChoiceViewSet,
    ParameterViewSet,
    SectionViewSet,
    SiteViewSet,
    UOMViewSet,
)

router = DefaultRouter()
router.register("sites", SiteViewSet, basename="site")
router.register("sections", SectionViewSet, basename="section")
router.register("machine-types", MachineTypeViewSet, basename="machinetype")
router.register("uoms", UOMViewSet, basename="uom")
router.register("parameters", ParameterViewSet, basename="parameter")
router.register("parameter-choices", ParameterChoiceViewSet, basename="parameterchoice")
router.register("crusher-units", CrusherUnitViewSet, basename="crusherunit")
router.register("delivery-destinations", DeliveryDestinationViewSet, basename="deliverydestination")
router.register("downtime-reason-codes", DowntimeReasonCodeViewSet, basename="downtimereasoncode")

urlpatterns = router.urls
