from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import ChangeOwnPasswordView, MeView, UserSiteAccessViewSet, UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("user-site-accesses", UserSiteAccessViewSet, basename="usersiteaccess")

urlpatterns = [
    path("auth/login/", TokenObtainPairView.as_view(), name="auth-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/change-password/", ChangeOwnPasswordView.as_view(), name="auth-change-password"),
    path("", include(router.urls)),
]
