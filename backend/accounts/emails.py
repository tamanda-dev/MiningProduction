import secrets
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.mail import send_mail
from django.utils import timezone

from .models import PasswordResetOTP


def generate_and_send_otp(user) -> None:
    """Creates a fresh 6-digit OTP for `user` and emails it. Older
    outstanding OTPs are left as-is (they still expire/exhaust on their own
    terms) — the reset endpoint only ever accepts the most recent one.
    """

    code = f"{secrets.randbelow(1_000_000):06d}"
    PasswordResetOTP.objects.create(
        user=user,
        code_hash=make_password(code),
        expires_at=timezone.now() + timedelta(minutes=PasswordResetOTP.TTL_MINUTES),
    )
    send_mail(
        subject="Your Mining Production password reset code",
        message=(
            f"Your password reset code is {code}.\n\n"
            f"This code expires in {PasswordResetOTP.TTL_MINUTES} minutes and can only be used once. "
            "If you didn't request a password reset, you can safely ignore this email."
        ),
        from_email=None,
        recipient_list=[user.email],
        fail_silently=False,
    )
