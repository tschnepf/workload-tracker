from __future__ import annotations

import threading
import time
from collections import deque
from contextlib import contextmanager
from typing import Callable, Deque, Dict, Tuple

_registry_lock = threading.Lock()
_connection_semaphores: Dict[int, Tuple[threading.BoundedSemaphore, int]] = {}
_provider_windows: Dict[str, Deque[float]] = {}
_provider_locks: Dict[str, threading.Lock] = {}


def _get_connection_semaphore(connection_id: int, limit: int) -> threading.BoundedSemaphore:
    with _registry_lock:
        semaphore, current_limit = _connection_semaphores.get(connection_id, (None, None))
        if semaphore is None or current_limit != limit:
            semaphore = threading.BoundedSemaphore(max(1, limit))
            _connection_semaphores[connection_id] = (semaphore, limit)
        return semaphore


def _get_provider_gate(provider_key: str) -> Tuple[threading.Lock, Deque[float]]:
    with _registry_lock:
        lock = _provider_locks.setdefault(provider_key, threading.Lock())
        window = _provider_windows.setdefault(provider_key, deque())
    return lock, window


class BQERateLimiter:
    def __init__(self, provider_key: str, connection_id: int, *, max_concurrent: int, global_rpm: int, sleep_fn: Callable[[float], None]):
        self.provider_key = provider_key
        self.connection_id = connection_id
        self.max_concurrent = max(1, int(max_concurrent or 1))
        self.global_rpm = max(0, int(global_rpm or 0))
        self.sleep = sleep_fn

    @contextmanager
    def slot(self):
        semaphore = _get_connection_semaphore(self.connection_id, self.max_concurrent)
        semaphore.acquire()
        try:
            self._wait_for_global_slot()
            yield
        finally:
            semaphore.release()

    def _wait_for_global_slot(self) -> None:
        if self.global_rpm <= 0:
            return
        lock, window = _get_provider_gate(self.provider_key)
        while True:
            with lock:
                now = time.monotonic()
                while window and now - window[0] >= 60:
                    window.popleft()
                if len(window) < self.global_rpm:
                    window.append(now)
                    return
                oldest = window[0]
                wait_seconds = max(0.1, 60 - (now - oldest))
            self.sleep(min(wait_seconds, 5))
