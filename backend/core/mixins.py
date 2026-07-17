from . import scoping


class SiteScopedQuerySetMixin:
    """Applied to viewsets to enforce site/section RBAC scoping at the
    queryset level (in addition to any object-level permission classes).

    Subclasses set:
      site_lookup    - ORM lookup path from the model to Site's id,
                        e.g. "site_id" or "section__site_id".
      section_lookup - optional ORM lookup path to Section's id, used to
                        further narrow results for users restricted to
                        specific sections (e.g. a Supervisor).
    """

    site_lookup = "site_id"
    section_lookup = None

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user or not user.is_authenticated:
            return qs.none()

        site_ids = scoping.accessible_site_ids(user)
        if site_ids is not None:
            qs = qs.filter(**{f"{self.site_lookup}__in": site_ids})

        if self.section_lookup:
            section_ids = scoping.accessible_section_ids(user)
            if section_ids is not None:
                qs = qs.filter(**{f"{self.section_lookup}__in": section_ids})

        return qs


class SiteScopedOrOwnQuerySetMixin(SiteScopedQuerySetMixin):
    """Like SiteScopedQuerySetMixin, but also always includes records the
    requesting user owns (e.g. their own submitted entries), regardless of
    site scoping. Operators typically hold no UserSiteAccess rows at all —
    without this, a plain SiteScopedQuerySetMixin filters their own
    entries out entirely (accessible_site_ids returns an empty set, not
    None, for a non-Manager/Admin with zero rows), so an operator could
    never see or edit an entry they themselves just submitted.

    Subclasses set `owner_lookup` (default "operator_id") to the ORM
    lookup path identifying the owning user.
    """

    owner_lookup = "operator_id"

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return super().get_queryset()

        site_ids = scoping.accessible_site_ids(user)
        if site_ids is None:
            return super().get_queryset()

        # Base (unscoped) queryset, filtered to site-accessible rows OR
        # rows this user owns — a plain OR, since both are valid reasons
        # to see a row.
        from django.db.models import Q

        base_qs = super(SiteScopedQuerySetMixin, self).get_queryset()
        return base_qs.filter(
            Q(**{f"{self.site_lookup}__in": site_ids}) | Q(**{self.owner_lookup: user.id})
        )
