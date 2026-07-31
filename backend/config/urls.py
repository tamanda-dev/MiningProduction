from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("api/", include("accounts.urls")),
    path("api/", include("masterdata.urls")),
    path("api/", include("machines.urls")),
    path("api/", include("shiftmgmt.urls")),
    path("api/", include("planning.urls")),
    path("api/", include("entries.urls")),
    path("api/", include("audit.urls")),
    path("api/dashboard/", include("dashboard.urls")),
    path("api/", include("crusher_ops.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
