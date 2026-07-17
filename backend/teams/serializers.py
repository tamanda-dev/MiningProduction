from rest_framework import serializers

from .models import ShiftPattern, Team, TeamMember


class ShiftPatternSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftPattern
        fields = ("id", "name", "description", "active")


class TeamMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeamMember
        fields = ("id", "team", "user", "role_on_team", "active")


class TeamSerializer(serializers.ModelSerializer):
    members = TeamMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Team
        fields = ("id", "name", "site", "section", "shift_pattern", "active", "members")
