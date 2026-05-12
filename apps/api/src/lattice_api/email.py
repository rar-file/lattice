"""Mail sender — Resend in production, in-memory queue in tests/local.

Tests assert against `Mailer.sent` directly. Production uses RESEND_API_KEY.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

import httpx

log = logging.getLogger("lattice.email")

RESEND_API = "https://api.resend.com/emails"


@dataclass
class SentEmail:
    to: str
    subject: str
    body: str


@dataclass
class Mailer:
    """In-memory mailer used by tests and local dev. Production swaps to ResendMailer."""

    sent: list[SentEmail] = field(default_factory=list)
    from_addr: str = "Lattice <noreply@lattice.app>"

    async def send(self, *, to: str, subject: str, body: str) -> None:
        log.info("mail (memory) to=%s subject=%s", to, subject)
        self.sent.append(SentEmail(to=to, subject=subject, body=body))


class ResendMailer:
    def __init__(self, api_key: str, from_addr: str = "Lattice <noreply@lattice.app>") -> None:
        self.api_key = api_key
        self.from_addr = from_addr
        self.sent: list[SentEmail] = []  # kept for parity with Mailer

    async def send(self, *, to: str, subject: str, body: str) -> None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                RESEND_API,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "from": self.from_addr,
                    "to": [to],
                    "subject": subject,
                    "text": body,
                },
            )
            r.raise_for_status()
        self.sent.append(SentEmail(to=to, subject=subject, body=body))


def build_default_mailer() -> Mailer | ResendMailer:
    api_key = os.getenv("RESEND_API_KEY")
    if api_key:
        return ResendMailer(api_key=api_key)
    return Mailer()
