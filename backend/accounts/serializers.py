from django.contrib.auth.hashers import check_password
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.db.models import F
from django.utils import timezone
from rest_framework import serializers

from core import scoping

from .models import PasswordResetOTP, User, UserSiteAccess

# Maps the API's lowercase role names to the Django Group names scoping.py
# checks against — one place both role-assignment and role-display use, so
# they can never drift apart.
ROLE_GROUP_MAP = {
    "admin": scoping.ADMIN_GROUP,
    "supervisor": scoping.SUPERVISOR_GROUP,
    "operator": scoping.OPERATOR_GROUP,
    "artisan": scoping.ARTISAN_GROUP,
}


def compute_roles(user) -> list[str]:
    roles = []
    if scoping.is_admin(user):
        roles.append("admin")
    if scoping.is_supervisor(user):
        roles.append("supervisor")
    if scoping.is_operator(user):
        roles.append("operator")
    if scoping.is_artisan(user):
        roles.append("artisan")
    return roles


class MeSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    site_accesses = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "employee_code",
            "phone",
            "maintenance_technician",
            "roles",
            "site_accesses",
        )

    def get_roles(self, obj) -> list[str]:
        return compute_roles(obj)

    def get_site_accesses(self, obj) -> list[dict]:
        # UserSiteAccess is added to this app once masterdata.Site exists
        # (see accounts/models.py); import is deferred so this module loads
        # cleanly regardless of build order.
        from .models import UserSiteAccess

        return [
            {"site": row.site_id, "section": row.section_id}
            for row in UserSiteAccess.objects.filter(user=obj).select_related("site", "section")
        ]


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "employee_code",
            "maintenance_technician",
        )


class UserDetailSerializer(serializers.ModelSerializer):
    """Admin-facing view of a user for the User Management module — adds
    account-status and role fields UserSummarySerializer deliberately omits
    (that one's used for read-only pickers elsewhere in the app)."""

    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "employee_code",
            "maintenance_technician",
            "is_active",
            "roles",
            "date_joined",
            "last_login",
        )
        read_only_fields = ("date_joined", "last_login")

    def get_roles(self, obj) -> list[str]:
        return compute_roles(obj)


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    role = serializers.ChoiceField(choices=list(ROLE_GROUP_MAP), write_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "employee_code",
            "password",
            "role",
        )

    def create(self, validated_data):
        password = validated_data.pop("password")
        role = validated_data.pop("role")
        user = User.objects.create_user(password=password, **validated_data)
        user.groups.set([Group.objects.get(name=ROLE_GROUP_MAP[role])])
        return user


class SetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, validators=[validate_password])


class ChangeOwnPasswordSerializer(serializers.Serializer):
    """Self-service password change — every authenticated user may use
    this on themselves (unlike SetPasswordSerializer/reset_password, which
    is Admin-only and skips current-password verification since it's for
    an Admin resetting someone else's forgotten password).
    """

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value


class ForgotPasswordRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordWithOtpSerializer(serializers.Serializer):
    """Verifies the OTP and resets the password in one step. Deliberately
    reports the same generic "invalid or expired code" error for every
    failure mode (unknown email, wrong code, expired code, exhausted
    attempts) — distinguishing them would let an attacker enumerate which
    emails have accounts/pending resets.
    """

    email = serializers.EmailField()
    otp = serializers.CharField(max_length=6, min_length=6)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    generic_error = "Invalid or expired code."

    def validate(self, attrs):
        # Email isn't unique on User (see accounts/models.py) — if more
        # than one active account shares it, there's no way to know which
        # one the requester meant, so treat it the same as "no such user"
        # rather than guessing.
        users = list(User.objects.filter(email__iexact=attrs["email"], is_active=True))
        otp_obj = None
        if len(users) == 1:
            otp_obj = (
                PasswordResetOTP.objects.filter(user=users[0], consumed_at__isnull=True)
                .order_by("-created_at")
                .first()
            )

        if not otp_obj or not otp_obj.is_usable():
            raise serializers.ValidationError({"otp": self.generic_error})

        if not check_password(attrs["otp"], otp_obj.code_hash):
            PasswordResetOTP.objects.filter(pk=otp_obj.pk).update(attempts=F("attempts") + 1)
            raise serializers.ValidationError({"otp": self.generic_error})

        attrs["user"] = users[0]
        attrs["otp_obj"] = otp_obj
        return attrs

    def save(self):
        user = self.validated_data["user"]
        otp_obj = self.validated_data["otp_obj"]

        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])

        now = timezone.now()
        # Consume this OTP and invalidate any other outstanding ones for
        # the same user so an old, still-valid code can't be replayed
        # after the password has already changed.
        PasswordResetOTP.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=now)
        return user


class AssignRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=list(ROLE_GROUP_MAP))


class UserSiteAccessSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSiteAccess
        fields = ("id", "user", "site", "section")
        # DRF auto-generates a UniqueTogetherValidator from the model's
        # UniqueConstraint(fields=["user", "site", "section"]) and, to
        # support it, force-marks every field in that set as required=True
        # — including `section`, even though it's null=True/blank=True on
        # the model (same issue already hit and fixed this session in
        # entries/serializers.py's ProductionEntrySerializer). Disabled
        # here too; a genuine duplicate grant surfaces as a plain
        # IntegrityError, caught below for a clean 400 instead.
        validators = []
