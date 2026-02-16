import os
import shutil
import tempfile
import time
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import JobAccessRecord
from core.restore_tokens import issue_restore_job_token


class _DummyAsyncResult:
    def __init__(self, job_id: str):
        self.id = job_id
        self.state = 'SUCCESS'
        self.info = {'progress': 100, 'message': 'done'}

    def get(self, propagate=False):
        return {'ok': True}


def _feature_flags(**updates):
    from django.conf import settings

    merged = {**getattr(settings, 'FEATURES', {})}
    merged.update(updates)
    return merged


class JobAccessControlTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username='owner', password='x')
        self.other = User.objects.create_user(username='other', password='x')
        self.admin = User.objects.create_user(username='admin', password='x', is_staff=True)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    @override_settings(FEATURES=_feature_flags(JOB_AUTHZ_ENFORCED=True))
    def test_owner_can_read_status_when_enforced(self):
        JobAccessRecord.objects.create(job_id='job-owner', created_by=self.owner, is_admin_only=False, purpose='test')
        self._auth(self.owner)
        with patch('core.job_views.AsyncResult', _DummyAsyncResult):
            resp = self.client.get('/api/jobs/job-owner/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get('id'), 'job-owner')

    @override_settings(FEATURES=_feature_flags(JOB_AUTHZ_ENFORCED=True))
    def test_non_owner_denied_when_enforced(self):
        JobAccessRecord.objects.create(job_id='job-owner', created_by=self.owner, is_admin_only=False, purpose='test')
        self._auth(self.other)
        with patch('core.job_views.AsyncResult', _DummyAsyncResult):
            resp = self.client.get('/api/jobs/job-owner/')
        self.assertEqual(resp.status_code, 403)

    @override_settings(FEATURES=_feature_flags(JOB_AUTHZ_ENFORCED=True))
    def test_admin_override_allowed_when_enforced(self):
        JobAccessRecord.objects.create(job_id='job-owner', created_by=self.owner, is_admin_only=False, purpose='test')
        self._auth(self.admin)
        with patch('core.job_views.AsyncResult', _DummyAsyncResult):
            resp = self.client.get('/api/jobs/job-owner/')
        self.assertEqual(resp.status_code, 200)

    @override_settings(FEATURES=_feature_flags(JOB_AUTHZ_ENFORCED=True))
    def test_missing_metadata_denied_when_enforced(self):
        self._auth(self.owner)
        with patch('core.job_views.AsyncResult', _DummyAsyncResult):
            resp = self.client.get('/api/jobs/legacy-job/')
        self.assertEqual(resp.status_code, 403)
        self.assertIn('Legacy', resp.json().get('detail', ''))

    def test_anonymous_denied_outside_restore_mode(self):
        with patch('core.job_views.AsyncResult', _DummyAsyncResult):
            resp = self.client.get('/api/jobs/job-any/')
        self.assertIn(resp.status_code, (401, 403))

    @override_settings(
        FEATURES=_feature_flags(JOB_AUTHZ_ENFORCED=True, JOB_RESTORE_TOKEN_MODE=True),
        RESTORE_JOB_TOKEN_SECRET='restore-secret-for-tests',
        RESTORE_JOB_TOKEN_TTL_SECONDS=300,
    )
    def test_restore_token_allows_anonymous_during_restore(self):
        tmpdir = tempfile.mkdtemp(prefix='restore-lock-')
        try:
            lock_path = os.path.join(tmpdir, '.restore.lock')
            with open(lock_path, 'w', encoding='utf-8') as lock:
                lock.write('restore-session-1')
            with override_settings(BACKUPS_DIR=tmpdir):
                token = issue_restore_job_token(job_id='restore-job')
                with patch('core.job_views.AsyncResult', _DummyAsyncResult):
                    resp = self.client.get(f'/api/jobs/restore-job/?rt={token}')
                self.assertEqual(resp.status_code, 200)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    @override_settings(
        FEATURES=_feature_flags(JOB_AUTHZ_ENFORCED=True, JOB_RESTORE_TOKEN_MODE=True),
        RESTORE_JOB_TOKEN_SECRET='restore-secret-for-tests',
        RESTORE_JOB_TOKEN_TTL_SECONDS=300,
    )
    def test_restore_token_rejected_for_wrong_job(self):
        tmpdir = tempfile.mkdtemp(prefix='restore-lock-')
        try:
            lock_path = os.path.join(tmpdir, '.restore.lock')
            with open(lock_path, 'w', encoding='utf-8') as lock:
                lock.write('restore-session-1')
            with override_settings(BACKUPS_DIR=tmpdir):
                token = issue_restore_job_token(job_id='restore-job')
                with patch('core.job_views.AsyncResult', _DummyAsyncResult):
                    resp = self.client.get(f'/api/jobs/different-job/?rt={token}')
                self.assertEqual(resp.status_code, 403)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    @override_settings(
        FEATURES=_feature_flags(JOB_AUTHZ_ENFORCED=True, JOB_RESTORE_TOKEN_MODE=True),
        RESTORE_JOB_TOKEN_SECRET='restore-secret-for-tests',
        RESTORE_JOB_TOKEN_TTL_SECONDS=1,
    )
    def test_restore_token_expires(self):
        tmpdir = tempfile.mkdtemp(prefix='restore-lock-')
        try:
            lock_path = os.path.join(tmpdir, '.restore.lock')
            with open(lock_path, 'w', encoding='utf-8') as lock:
                lock.write('restore-session-1')
            with override_settings(BACKUPS_DIR=tmpdir):
                token = issue_restore_job_token(job_id='restore-job')
                time.sleep(2)
                with patch('core.job_views.AsyncResult', _DummyAsyncResult):
                    resp = self.client.get(f'/api/jobs/restore-job/?rt={token}')
                self.assertEqual(resp.status_code, 403)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    @override_settings(
        FEATURES=_feature_flags(JOB_AUTHZ_ENFORCED=True, JOB_RESTORE_TOKEN_MODE=True),
        RESTORE_JOB_TOKEN_SECRET='restore-secret-for-tests',
        RESTORE_JOB_TOKEN_TTL_SECONDS=300,
    )
    def test_restore_token_rejected_after_session_rotation(self):
        tmpdir = tempfile.mkdtemp(prefix='restore-lock-')
        try:
            lock_path = os.path.join(tmpdir, '.restore.lock')
            with open(lock_path, 'w', encoding='utf-8') as lock:
                lock.write('restore-session-1')
            with override_settings(BACKUPS_DIR=tmpdir):
                token = issue_restore_job_token(job_id='restore-job')
                with open(lock_path, 'w', encoding='utf-8') as lock:
                    lock.write('restore-session-2')
                with patch('core.job_views.AsyncResult', _DummyAsyncResult):
                    resp = self.client.get(f'/api/jobs/restore-job/?rt={token}')
                self.assertEqual(resp.status_code, 403)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    @override_settings(
        FEATURES=_feature_flags(JOB_AUTHZ_ENFORCED=True, JOB_RESTORE_TOKEN_MODE=True),
        RESTORE_JOB_TOKEN_SECRET='restore-secret-for-tests',
        RESTORE_JOB_TOKEN_TTL_SECONDS=300,
    )
    def test_restore_token_rejected_when_restore_mode_ends(self):
        tmpdir = tempfile.mkdtemp(prefix='restore-lock-')
        try:
            lock_path = os.path.join(tmpdir, '.restore.lock')
            with open(lock_path, 'w', encoding='utf-8') as lock:
                lock.write('restore-session-1')
            with override_settings(BACKUPS_DIR=tmpdir):
                token = issue_restore_job_token(job_id='restore-job')
                os.remove(lock_path)
                with patch('core.job_views.AsyncResult', _DummyAsyncResult):
                    resp = self.client.get(f'/api/jobs/restore-job/?rt={token}')
                self.assertEqual(resp.status_code, 401)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_job_access_record_is_immutable_and_unique(self):
        rec = JobAccessRecord.objects.create(job_id='immutable-job', created_by=self.owner, is_admin_only=False)
        with self.assertRaises(ValidationError):
            rec.purpose = 'changed'
            rec.save()
        with self.assertRaises(IntegrityError):
            JobAccessRecord.objects.create(job_id='immutable-job', created_by=self.owner, is_admin_only=False)
