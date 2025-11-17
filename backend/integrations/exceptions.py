from __future__ import annotations


class IntegrationProviderError(Exception):
    """Raised when a provider explicitly rejects our request (permissions, config, etc.)."""

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        provider_message: str | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.provider_message = provider_message
