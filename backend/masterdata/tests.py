import pytest

from masterdata.models import Section, Site


@pytest.mark.django_db
def test_site_code_auto_generated_from_name_when_blank():
    site = Site.objects.create(name="South Pit")
    assert site.code == "south-pit"


@pytest.mark.django_db
def test_site_auto_generated_code_deduplicates_on_collision():
    Site.objects.create(name="South Pit")
    other = Site.objects.create(name="South Pit")
    assert other.code == "south-pit-2"


@pytest.mark.django_db
def test_section_code_auto_generated_from_name_when_blank():
    site = Site.objects.create(name="South Pit")
    section = Section.objects.create(site=site, name="Crushing")
    assert section.code == "crushing"


@pytest.mark.django_db
def test_section_auto_generated_code_is_scoped_per_site_not_global():
    site_a = Site.objects.create(name="South Pit")
    site_b = Site.objects.create(name="North Pit")
    section_a = Section.objects.create(site=site_a, name="Crushing")
    section_b = Section.objects.create(site=site_b, name="Crushing")
    assert section_a.code == section_b.code == "crushing"


@pytest.mark.django_db
def test_explicit_code_is_kept_as_is():
    site = Site.objects.create(name="South Pit", code="sp")
    assert site.code == "sp"
