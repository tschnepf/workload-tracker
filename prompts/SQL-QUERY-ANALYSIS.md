# SQL Query Analysis Report

This report scans the repository for SQL usage: direct SQL strings, subprocess `psql` invocations, and ORM query‑builder patterns that translate to SQL. For each, it lists the location, the extracted SQL (or ORM statement with an approximate SQL), issues, optimizations, best‑practice notes, and a brief plain‑language explanation.

---

## Raw SQL (cursor/psql)

### 1) Database bloat report
- Location: `backend/monitoring/management/commands/monitor_performance.py:80`
- SQL:
  ```sql
  SELECT 
      schemaname,
      tablename,
      pg_size_pretty(table_bytes) AS table_size,
      pg_size_pretty(bloat_bytes) as bloat_size,
      round((bloat_bytes::float / table_bytes::float) * 100, 2) as bloat_pct
  FROM (
      SELECT 
          schemaname, tablename,
          pg_total_relation_size(schemaname||'.'||tablename) as table_bytes,
          (pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as bloat_bytes
      FROM pg_tables 
      WHERE schemaname = 'public'
  ) bloat_info
  WHERE bloat_bytes > 0
  ORDER BY bloat_pct DESC;
  ```
- Execution: `cursor.execute(bloat_query)` at `backend/monitoring/management/commands/monitor_performance.py:101`
- Issues:
  - PostgreSQL-specific system catalogs/functions; will fail on SQLite/MySQL. OK if command is prod-only.
  - Uses `SELECT ... FROM pg_tables` which excludes TOAST/indices; “bloat” is heuristic here.
- Optimizations:
  - Consider `pg_stat_all_tables` or `pgstattuple` for more precise stats (if extension allowed). Run off-peak as it can be heavy.
  - Add a limit (e.g., `LIMIT 50`) when used for dashboards to cap output.
- Best practices:
  - Read-only query; safe. Ensure this command is guarded to run only on Postgres.
- Plain-language explanation:
  - What it does: Checks which database tables have wasted space and ranks them by how “bloated” they are.
  - Is this a best practice? Yes for Postgres operations teams, as a diagnostic. It should be used in the right environment.
  - If not best practice, what to do instead: When you need more accurate results, use Postgres extensions or views designed for bloat analysis (e.g., `pgstattuple`) and run them during low-traffic windows.

### 2) Enumerate public tables and VACUUM ANALYZE each
- Location: `backend/monitoring/management/commands/monitor_performance.py:137`
- SQL (table list):
  ```sql
  SELECT tablename FROM pg_tables 
  WHERE schemaname = 'public'
  ORDER BY tablename;
  ```
- Execution: `cursor.execute(table_query)` at `backend/monitoring/management/commands/monitor_performance.py:145`
- Follow-up per-table execution: `cursor.execute(f'VACUUM ANALYZE "{table}";')` at `backend/monitoring/management/commands/monitor_performance.py:152`
- Issues:
  - VACUUM is PostgreSQL-specific. The f-string injects an identifier; double-quotes are used but not escaped. If a table name contains a double quote, this can break. Risk is low for system-provided names.
- Optimizations:
  - Consider a single `VACUUM (ANALYZE)` without listing tables when permissible; or parallelize in maintenance windows.
  - Skip small tables below a size threshold using `pg_total_relation_size` to reduce maintenance time.
- Best practices:
  - If keeping dynamic identifiers, prefer safe identifier quoting (e.g., Django `connection.ops.quote_name(table)` or psycopg `sql.Identifier`).
- Plain-language explanation:
  - What it does: Lists all tables and refreshes their storage stats so the database can plan queries efficiently.
  - Is this a best practice? Generally yes, but building the per-table command using raw text is not ideal.
  - If not best practice, what to do instead: Either run a single database-wide “vacuum analyze” or ensure table names are safely quoted using built-in helpers to avoid edge cases.

### 3) Active connection count
- Location: `backend/monitoring/management/commands/monitor_performance.py:293`
- SQL:
  ```sql
  SELECT count(*) FROM pg_stat_activity 
  WHERE state = 'active' AND pid != pg_backend_pid();
  ```
- Issues:
  - PostgreSQL-specific DMV usage.
- Optimizations:
  - Optionally filter to current DB: `AND datname = current_database()`.
  - If run frequently, consider caching at app level to avoid frequent DMV scans.
- Best practices: Query is read-only and parameterless; safe.
- Plain-language explanation:
  - What it does: Counts how many database sessions are currently busy.
  - Is this a best practice? Yes; it’s a low-risk health check.
  - If not best practice, what to do instead: Optionally scope it to the current database to avoid counting unrelated activity.

### 4) DB connectivity health checks
- Locations:
  - `backend/monitoring/management/commands/monitor_performance.py:346`
  - `backend/config/urls.py:48`
- SQL:
  ```sql
  SELECT 1;
  ```
- Issues: None.
- Optimizations: None (minimal cost).
- Best practices: Safe, parameterless check.
- Plain-language explanation:
  - What it does: Verifies the app can talk to the database at all.
  - Is this a best practice? Yes; it’s the standard minimal health probe.
  - If not best practice, what to do instead: N/A — this is appropriate as-is.

### 5) SimpleJWT blacklist table checks and repair
- Locations and SQL:
  - Existence checks:
    - `backend/core/management/commands/repair_token_blacklist.py:36`
      ```sql
      SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'token_blacklist_outstandingtoken'
      );
      ```
    - `backend/core/management/commands/repair_token_blacklist.py:45`
      ```sql
      SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'token_blacklist_blacklistedtoken'
      );
      ```
  - Column listings:
    - `backend/core/management/commands/repair_token_blacklist.py:56`
      ```sql
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'token_blacklist_outstandingtoken';
      ```
    - `backend/core/management/commands/repair_token_blacklist.py:67`
      ```sql
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'token_blacklist_blacklistedtoken';
      ```
  - Drops:
    - `backend/core/management/commands/repair_token_blacklist.py:96`
      ```sql
      DROP TABLE IF EXISTS token_blacklist_blacklistedtoken CASCADE;
      ```
    - `backend/core/management/commands/repair_token_blacklist.py:97`
      ```sql
      DROP TABLE IF EXISTS token_blacklist_outstandingtoken CASCADE;
      ```
- Issues:
  - PostgreSQL/ANSI information_schema used (good); will not work on SQLite. Drops are destructive (intended).
- Optimizations:
  - None; operations are administrative.
- Best practices:
  - SQL is constant and safe. Keep behind explicit opt-in and confirmations (already present).
- Plain-language explanation:
  - What it does: Checks that two authentication tables look correct and, if not, drops and recreates them.
  - Is this a best practice? It’s acceptable for recovery/maintenance, but destructive actions should be gated.
  - If not best practice, what to do instead: Keep the repair behind an explicit flag/confirmation (already done) and prefer schema migrations over ad‑hoc drops when possible.

### 6) Restore workflow health and metadata (psql subprocess)
- Locations and SQL:
  - Connection probe: `backend/core/management/commands/restore_database.py:54`
    ```sql
    SELECT 1
    ```
  - Migration state: `backend/core/management/commands/restore_database.py:69`
    ```sql
    SELECT app, max(name) FROM django_migrations GROUP BY app ORDER BY app;
    ```
  - Session control (best-effort): `backend/core/management/commands/restore_database.py:86-93`
    ```sql
    REVOKE CONNECT ON DATABASE "{dbname}" FROM PUBLIC;
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid();
    ```
  - Schema reset: `backend/core/management/commands/restore_database.py:99-104`
    ```sql
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO PUBLIC;
    ```
  - Optional post-restore: `backend/core/management/commands/restore_database.py:320`
    ```sql
    VACUUM ANALYZE;
    ```
- Issues:
  - PostgreSQL-specific; requires superuser for `pg_terminate_backend` and some GRANT/REVOKE.
  - Identifier injection risk on `REVOKE CONNECT ... "{dbname}" ...` if dbname contains a double quote. Low likelihood; still advisable to escape.
- Optimizations:
  - Use `-v dbname=...` and `:"dbname"` in psql to leverage psql’s quoting instead of f-strings.
  - Consider `ALTER DATABASE ... ALLOW_CONNECTIONS = false` on PG ≥ 16, then restore setting.
- Best practices:
  - Administrative SQL is executed via `psql` with `ON_ERROR_STOP=1`; good. Consider ensuring privileges and documenting production prerequisites.
- Plain-language explanation:
  - What it does: Prepares the database for a restore by disconnecting others, recreating the schema, and optionally refreshing stats afterward.
  - Is this a best practice? Yes for disaster recovery flows, but hand‑built identifier strings can be risky.
  - If not best practice, what to do instead: Pass database names and other identifiers through safe quoting or psql variables rather than string interpolation.

### 7) Backup preflight and metadata (psql subprocess)
- Locations and SQL:
  - DB size estimate: `backend/core/management/commands/backup_database.py:59`
    ```sql
    SELECT pg_database_size(current_database());
    ```
  - Server version: `backend/core/management/commands/backup_database.py:75`
    ```sql
    SHOW server_version;
    ```
- Issues: PostgreSQL-specific; read-only. None.
- Optimizations: None needed.
- Best practices: Safe; run with low privileges.
- Plain-language explanation:
  - What it does: Asks the database how big it is and what version it is before/after a backup.
  - Is this a best practice? Yes; it informs capacity and compatibility checks.
  - If not best practice, what to do instead: N/A — this is appropriate as-is.

---

## ORM Query Builder (Django)

Note: SQL below is representative; exact table/alias names differ per Django model/table names. All ORM calls are parameterized by the ORM and safe from injection.

### 8) PreDeliverable duplicates detection
- Location: `backend/core/management/commands/validate_pre_deliverable_data.py:53`
- ORM:
  ```python
  dupes = (
      qs.values('deliverable_id', 'pre_deliverable_type_id')
        .order_by()
        .annotate(cnt=models.Count('id'))
        .filter(cnt__gt=1)
  )
  ```
- Approx SQL:
  ```sql
  SELECT deliverable_id, pre_deliverable_type_id, COUNT(id) AS cnt
  FROM deliverables_predeliverableitem
  GROUP BY deliverable_id, pre_deliverable_type_id
  HAVING COUNT(id) > 1;
  ```
- Issues: None; avoids SELECT * and uses grouping.
- Optimizations:
  - Ensure indexes on `(deliverable_id, pre_deliverable_type_id)` for faster grouping.
- Best practices: Uses `order_by()` reset to avoid unnecessary ORDER BY; good.
- Plain-language explanation:
  - What it does: Finds duplicate items that refer to the same deliverable and type.
  - Is this a best practice? Yes; it’s a clean way to detect data quality issues.
  - If not best practice, what to do instead: Ensure an index or unique constraint supports this to prevent duplicates up-front.

### 9) PreDeliverable completion summary (by project and type)
- Location: `backend/reports/views.py:39-99`
- ORM (by project example):
  ```python
  proj_rows = (
      qs.values('deliverable__project_id', 'deliverable__project__name')
        .annotate(
            total=Count('id'),
            completed=Count('id', filter=Q(is_completed=True)),
            overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
        )
        .order_by('deliverable__project__name')
  )
  ```
- Approx SQL:
  ```sql
  SELECT d.project_id,
         p.name,
         COUNT(i.id) AS total,
         COUNT(i.id) FILTER (WHERE i.is_completed = TRUE) AS completed,
         COUNT(i.id) FILTER (WHERE i.is_completed = FALSE AND i.generated_date < CURRENT_DATE) AS overdue
  FROM deliverables_predeliverableitem i
  JOIN deliverables_deliverable d ON d.id = i.deliverable_id
  JOIN projects_project p ON p.id = d.project_id
  /* optional WHERE filters on generated_date, project_id, type_id applied earlier */
  GROUP BY d.project_id, p.name
  ORDER BY p.name;
  ```
- Issues:
  - Three separate counts (`total`, `completed`, `overdue`) are combined within a single grouped query (good). However, earlier totals (`total = qs.count()`, etc.) cause extra queries.
- Optimizations:
  - For the top-level totals, consider a single `.aggregate(total=Count('id'), completed=..., overdue=...)` to reduce round trips.
  - Indexes: `i(generated_date)`, partial index `i(is_completed) WHERE is_completed = false`, and FK indexes (Django usually provides) on `deliverable_id` and `project_id`.
- Best practices: Clear field qualification via ORM; safe and readable.
- Plain-language explanation:
  - What it does: Summarizes how many items are done or overdue per project/type within a date range.
  - Is this a best practice? Mostly yes; it’s efficient grouping. The multiple separate counts earlier in the function add extra trips.
  - If not best practice, what to do instead: Compute top‑level totals in one aggregate call to reduce extra database calls.

### 10) Team performance by person
- Location: `backend/reports/views.py:105-141`
- ORM:
  ```python
  rows = (
      qs.filter(deliverable__assignments__is_active=True)
        .values('deliverable__assignments__person_id', 'deliverable__assignments__person__name')
        .annotate(
            assigned=Count('id'),
            completed=Count('id', filter=Q(is_completed=True)),
            overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
        )
        .order_by('deliverable__assignments__person__name')
  )
  ```
- Approx SQL:
  ```sql
  SELECT a.person_id,
         person.name,
         COUNT(i.id) AS assigned,
         COUNT(i.id) FILTER (WHERE i.is_completed = TRUE) AS completed,
         COUNT(i.id) FILTER (WHERE i.is_completed = FALSE AND i.generated_date < CURRENT_DATE) AS overdue
  FROM deliverables_predeliverableitem i
  JOIN deliverables_deliverable d ON d.id = i.deliverable_id
  JOIN assignments_assignment a ON a.deliverable_id = d.id AND a.is_active = TRUE
  JOIN people_person person ON person.id = a.person_id
  /* optional WHERE on i.generated_date */
  GROUP BY a.person_id, person.name
  ORDER BY person.name;
  ```
- Issues: None obvious.
- Optimizations:
  - Indexes on `assignments (deliverable_id, is_active)` and `assignments (person_id, is_active)`.
  - Index on `predeliverableitem (generated_date)`.
- Best practices: Good use of filtered aggregates.
- Plain-language explanation:
  - What it does: Shows, per person, how many items they were assigned, completed, and have overdue.
  - Is this a best practice? Yes; it aggregates in the database rather than in app code.
  - If not best practice, what to do instead: Ensure the recommended indexes exist so this remains fast as data grows.

### 11) Projects filter metadata (exists + count)
- Location: `backend/projects/views.py:596-610`
- ORM:
  ```python
  projects_data = (
      queryset
        .annotate(
            assignment_count=Count('assignment', filter=Q(assignment__is_active=True)),
            has_future_deliverables=Exists(
                Deliverable.objects.filter(
                    project=OuterRef('pk'),
                    date__gt=today,
                    date__isnull=False,
                    is_completed=False,
                )
            ),
        )
        .values('id', 'assignment_count', 'has_future_deliverables', 'status')
  )
  ```
- Approx SQL:
  ```sql
  SELECT p.id,
         COUNT(a.id) FILTER (WHERE a.is_active = TRUE) AS assignment_count,
         EXISTS (
           SELECT 1 FROM deliverables_deliverable dd
           WHERE dd.project_id = p.id AND dd.date > CURRENT_DATE AND dd.date IS NOT NULL AND dd.is_completed = FALSE
         ) AS has_future_deliverables,
         p.status
  FROM projects_project p
  LEFT JOIN assignments_assignment a ON a.project_id = p.id
  GROUP BY p.id, p.status;
  ```
- Issues: None.
- Optimizations:
  - Indexes: `assignments (project_id, is_active)` partial; `deliverables (project_id, is_completed, date)` composite for the EXISTS subquery.
  - If `today` changes infrequently per request, it’s fine; avoid per-row function calls (ORM already inlines constant).
- Best practices: Uses `Exists` efficiently vs `JOIN` + `COUNT>0`.
- Plain-language explanation:
  - What it does: For each project, returns how many active assignments it has and whether it has any upcoming deliverables.
  - Is this a best practice? Yes; the “exists” check is an efficient pattern.
  - If not best practice, what to do instead: Make sure there are indexes on the fields used in the counts and date checks.

### 12) Deliverables calendar (with assignment count)
- Location: `backend/deliverables/views.py:338-373`
- ORM:
  ```python
  qs = (
      Deliverable.objects.all()
        .select_related('project')
        .annotate(
          assignmentCount=Count('assignments', filter=Q(assignments__is_active=True))
        )
  )
  # Optional `.aggregate(max_deliv=Max('updated_at'), max_assign=Max('assignments__updated_at'), total=Count('id'))`
  ```
- Approx SQL (list query):
  ```sql
  SELECT d.*, p.*, COUNT(a.id) FILTER (WHERE a.is_active = TRUE) AS assignmentCount
  FROM deliverables_deliverable d
  LEFT JOIN projects_project p ON p.id = d.project_id
  LEFT JOIN assignments_assignment a ON a.deliverable_id = d.id
  /* optional WHERE d.date BETWEEN ... or IS NOT NULL */
  GROUP BY d.id, p.id
  ORDER BY d.id DESC /* or serializer default */
  ```
- Issues:
  - Separate `.aggregate(...)` runs an additional query before listing results. Acceptable for ETag computation; be mindful under heavy load.
- Optimizations:
  - Indexes: `deliverable (date)`, `assignments (deliverable_id, is_active)`, `assignments (updated_at)`.
  - If only a subset of fields are needed, use `.only()`/`.values()` to reduce payload.
- Best practices: Proper use of `select_related` for project to avoid N+1.
- Plain-language explanation:
  - What it does: Lists deliverables within a date window, including how many active people are assigned to each.
  - Is this a best practice? Yes overall; minor caution that computing ETag stats triggers an extra query.
  - If not best practice, what to do instead: If needed under heavy load, compute those stats less often or cache them.

### 13) Deliverables calendar with pre-items
- Location: `backend/deliverables/views.py:393-467`
- ORM (deliverables part shown; similar to above):
  ```python
  qs = (
      Deliverable.objects.all()
        .select_related('project')
        .annotate(
          assignmentCount=Count('assignments', filter=Q(assignments__is_active=True))
        )
  )
  # pre_qs = PreDeliverableItem.objects.select_related('deliverable', 'deliverable__project', 'pre_deliverable_type')
  ```
- Approx SQL: Similar to item 12 plus a separate SELECT for `pre_qs` with joins to deliverable and project.
- Issues:
  - Manual list construction for `pre_qs` is fine; ensure `select_related` covers accessed attributes (it does).
- Optimizations:
  - Indexes: `predeliverableitem (generated_date, pre_deliverable_type_id)`, and where applicable, partial on overdue (`is_completed = false`).
- Best practices: Good composability; consider pagination if volume grows.
- Plain-language explanation:
  - What it does: Combines the main deliverables with their “pre‑items” (pre‑work checklist dates) for calendar display, optionally filtered to “my items”.
  - Is this a best practice? Yes; it preloads related data to avoid extra lookups.
  - If not best practice, what to do instead: Add pagination or date limits if the calendar grows very large to keep responses fast.

---

## Cross-Cutting Findings

- Parameterization & Safety
  - All Django ORM queries are parameterized and safe from SQL injection.
  - Raw SQL with dynamic identifiers: `VACUUM ANALYZE "{table}"` and `REVOKE CONNECT ON DATABASE "{dbname}"` should escape identifiers. Prefer library helpers: Django `connection.ops.quote_name`, or psycopg `sql.Identifier`, or psql variables with `-v`.

- Portability
  - Several commands use PostgreSQL-specific features (`pg_*` DMVs, `VACUUM`, `GRANT/REVOKE`, `DROP/CREATE SCHEMA`). Guard their execution to Postgres environments; avoid running on SQLite dev by default.

- Index Recommendations (high-value)
  - `assignments (project_id, is_active)` and `assignments (deliverable_id, is_active)`; consider partial indexes where `is_active = TRUE`.
  - `deliverables (project_id, is_completed, date)` composite to support EXISTS checks and date filtering.
  - `predeliverableitem (generated_date)` and partial `predeliverableitem (generated_date) WHERE is_completed = false` for overdue queries.
  - Ensure FK indexes exist (Django typically creates them).

- Query Shaping
  - Where totals are computed alongside groupings, prefer single `.aggregate(...)` calls over multiple `.count()` to reduce round trips.
  - Use `.only()`/`.values()` to project just the fields needed for API payloads.

- Monitoring/N+1
  - Current code uses `select_related` appropriately for accessed relations, reducing N+1 risks.
  - For endpoints iterating large querysets, consider pagination or `.values()` projections to cap payload.

---

## Queries To Rework (Flags & Fixes)

The following items are likely to cause issues or don’t follow SQL best practices. Each includes why it’s sub‑optimal, potential impact, and a recommended rework.

1) Dynamic identifier in VACUUM statements
- Location: `backend/monitoring/management/commands/monitor_performance.py:152`
- Pattern: `cursor.execute(f'VACUUM ANALYZE "{table}";')`
- Why not best practice:
  - Directly embedding identifiers via f-strings can break when names contain quotes or unusual characters and is fragile across schemas.
  - No vendor guard; this is Postgres‑only.
- Potential issues:
  - Syntax errors on edge‑case table names; unexpected behavior under non‑public schemas; accidental execution in non‑Postgres environments.
- Rework:
  - Quote identifiers safely: `connection.ops.quote_name(table)` or use psycopg’s `sql.Identifier`.
  - Add a vendor check (e.g., `if connection.vendor != 'postgresql': return`).
  - Optionally replace per‑table loop with a single `VACUUM (ANALYZE);` in maintenance windows.

2) REVOKE CONNECT uses f-string with database name
- Location: `backend/core/management/commands/restore_database.py:86`
- Pattern: `f"REVOKE CONNECT ON DATABASE \"{dbname}\" FROM PUBLIC;"`
- Why not best practice:
  - Hand‑built quoting for identifiers is error‑prone and can fail for names containing quotes.
- Potential issues:
  - Syntax errors or the wrong database targeted if quoting is imperfect; harder to audit and test.
- Rework:
  - Pass `dbname` to psql as a variable and reference with `:"dbname"`, or generate SQL via a quoting helper.
  - Keep all admin SQL parameterized/templated rather than concatenated.

3) Granting ALL on schema public to PUBLIC
- Location: `backend/core/management/commands/restore_database.py:102`
- SQL: `GRANT ALL ON SCHEMA public TO PUBLIC;`
- Why not best practice:
  - Grants broad privileges to every database role; many security baselines recommend revoking CREATE from PUBLIC on `public` schema and granting least privilege to application roles only.
- Potential issues:
  - Unintended ability for any role to create objects in `public`; escalated risk in shared clusters.
- Rework:
  - Consider `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` and grant only `USAGE` to PUBLIC; explicitly grant required privileges to your app role.
  - Align with your organization’s DB hardening standard.

4) Multiple COUNT() queries for top-level totals
- Location: `backend/reports/views.py:39-41`
- Pattern: `total = qs.count(); completed = qs.filter(...).count(); overdue = qs.filter(...).count()`
- Why not best practice:
  - Performs multiple round trips when a single aggregate query can compute all counts.
- Potential issues:
  - Extra latency and load under traffic spikes; harder to keep numbers perfectly consistent if the data changes between queries.
- Rework:
  - Use one call: `qs.aggregate(total=Count('id'), completed=Count('id', filter=Q(...)), overdue=Count('id', filter=Q(...)))`.

5) information_schema queries without schema qualifier
- Location: `backend/core/management/commands/repair_token_blacklist.py:36,45,56,67`
- Pattern: `WHERE table_name = 'token_blacklist_*'` (no `table_schema` filter)
- Why not best practice:
  - In databases with multiple schemas or altered `search_path`, results can be ambiguous or misleading.
- Potential issues:
  - False negatives/positives if similarly named tables exist in other schemas; repairs may be skipped or target the wrong objects.
- Rework:
  - Add `AND table_schema = 'public'` (or the configured schema) to existence/column checks.

6) Table enumeration for VACUUM via pg_tables
- Location: `backend/monitoring/management/commands/monitor_performance.py:137-146`
- SQL: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`
- Why not best practice:
  - `pg_tables` may exclude partitioned parents and doesn’t capture all relkinds you might want to analyze.
- Potential issues:
  - Partitions may be skipped; statistics left stale; suboptimal query plans.
- Rework:
  - Enumerate from `pg_class`/`pg_namespace` with `relkind IN ('r','p')` and the desired schemas; or rely on `VACUUM (ANALYZE)` without per‑table enumeration.

7) Postgres-specific commands without vendor guard
- Locations: Management commands under `backend/monitoring/...` and `backend/core/...` that query `pg_*` views, run `VACUUM`, or use Postgres DDL.
- Why not best practice:
  - These fail on SQLite/MySQL test/dev environments if invoked inadvertently.
- Potential issues:
  - Confusing stack traces for developers; noisy logs in CI.
- Rework:
  - Gate with `if connection.vendor != 'postgresql':` and provide a clear message or no‑op; document admin prerequisites in command help.
 
---

## Additional Round-Trip Optimizations
 
 These aren’t correctness bugs, but they reduce extra queries by consolidating work.
 
 1) Progress counter uses COUNT() per chunk
 - Location: `backend/projects/views.py:451`
 - Pattern: inside export streaming, `processed += chunk_queryset.count()` within a chunk loop.
 - Why it’s wasteful:
   - Executes a COUNT query for each chunk solely to update a progress number; the size of each chunk is already known from the slice bounds.
 - Quick fix:
   - Replace with arithmetic, e.g., `processed += min(chunk_size, total_count - chunk_start)`; avoids all per‑chunk COUNT queries.
 
 2) Repeated queryset.count() for logging/preview
 - Locations: `backend/projects/management/commands/export_projects.py:251, 267–268`; `backend/people/management/commands/export_people.py:146`.
 - Why it’s wasteful:
   - The same count is recomputed multiple times for messages. Each call runs a separate COUNT query.
 - Quick fix:
   - Compute once: `n = queryset.count()` and reuse `n` (and `n - 5`) across messages or pass `n` through to helpers.
 
 3) Template/empty check uses COUNT() instead of EXISTS
 - Location: `backend/projects/utils/excel_handler.py:37`
 - Current: `if is_template or queryset.count() == 0:`
 - Why it’s wasteful:
   - COUNT scans more than needed when you only need to know if any rows exist.
 - Quick fix:
   - Use `queryset.exists()` for the emptiness check.
 
 4) Top-level totals in reports
 - Location: `backend/reports/views.py:39–41`
 - Current: three separate `.count()` calls on related filters.
 - Why it’s wasteful:
   - Multiple round trips; already flagged above.
 - Quick fix:
   - Use a single `.aggregate(total=..., completed=..., overdue=...)` call.
 
 5) Multi-model last-modified watermarks (optional)
 - Locations: several views compute `Max(updated_at)` across multiple models (e.g., `projects/views.py:538–553`, `assignments/views.py:569–571`, `people/views.py:521–523`, `people/views.py:742–746`, `personal/views.py:163–169`).
 - Note:
   - These are not “easily combined” into a single SQL round trip because they span different tables. If needed, you could centralize by maintaining a single “activity watermark” row (e.g., via triggers or signals) or a materialized view that surfaces the max across tables, but that’s an architectural change, not a quick consolidation.

---

## Harsh Risk & Difficulty Assessment

### Queries To Rework (1–7)

1) Dynamic identifier in VACUUM statements
- Necessity: Should fix (safety hardening, correctness under edge cases).
- Risk (leave as‑is): Medium. Low likelihood of problematic table names, but vendor portability failures and occasional syntax errors are plausible; failures occur during maintenance windows.
- Difficulty (update): Low. Use `connection.ops.quote_name()` or psycopg `sql.Identifier`; add a vendor guard.

2) REVOKE CONNECT uses f‑string with database name
- Necessity: Should fix (reliability of restore flow).
- Risk (leave as‑is): Medium. Uncommon names with quotes break restores at the worst possible time (during recovery), causing avoidable downtime.
- Difficulty (update): Low. Pass via psql `-v dbname=...` and reference `:"dbname"`, or use a proper quoting helper.

3) GRANT ALL ON SCHEMA public TO PUBLIC
- Necessity: Must fix in hardened or multi‑tenant environments; advisable elsewhere.
- Risk (leave as‑is): High. Over‑granting enables unintended object creation/alteration by any role; increases blast radius.
- Difficulty (update): Low–Medium. Replace with least‑privilege grants (`USAGE` only to PUBLIC; specific privileges to app role); test restore scripts.

4) Multiple COUNT() queries for top‑level totals
- Necessity: Nice‑to‑have optimization.
- Risk (leave as‑is): Low. Extra DB round trips; minor latency under load; no correctness risk.
- Difficulty (update): Low. Replace with a single `.aggregate(...)` call.

5) information_schema without schema qualifier
- Necessity: Should fix for correctness in non‑trivial schemas.
- Risk (leave as‑is): Low–Medium. Ambiguity in multi‑schema setups can skip fixes or target the wrong objects.
- Difficulty (update): Low. Add `AND table_schema = 'public'` (or configured schema).

6) Table enumeration for VACUUM via pg_tables
- Necessity: Should fix if using partitions; otherwise acceptable but suboptimal.
- Risk (leave as‑is): Medium. Partitions or non‑table relkinds may be missed, leaving stale stats; degraded query plans over time.
- Difficulty (update): Low–Medium. Either run `VACUUM (ANALYZE)` without enumeration or enumerate via `pg_class/pg_namespace` with appropriate `relkind` filters.

7) Postgres‑specific commands without vendor guard
- Necessity: Should fix (developer experience, CI stability).
- Risk (leave as‑is): Low–Medium. Dev/CI failures when commands are invoked on SQLite/MySQL; noisy, but not a production breaker.
- Difficulty (update): Low. Add `if connection.vendor != 'postgresql':` early return and document prerequisites.

### Round‑Trip Optimizations (1–5)

1) Per‑chunk COUNT() in export progress
- Necessity: Nice‑to‑have (pure efficiency).
- Risk (leave as‑is): Low. Wastes queries but won’t break behavior.
- Difficulty (update): Trivial. Arithmetic with known slice bounds.

2) Repeated `.count()` in logging/preview
- Necessity: Nice‑to‑have.
- Risk (leave as‑is): Low. Minor overhead; noisy on very large datasets.
- Difficulty (update): Trivial. Store once and reuse.

3) `count()==0` vs `exists()`
- Necessity: Nice‑to‑have.
- Risk (leave as‑is): Low. Unnecessary work for empty checks.
- Difficulty (update): Trivial. Swap to `.exists()`.

4) Combine `.count()` into one `.aggregate()`
- Necessity: Should fix where endpoints are hot.
- Risk (leave as‑is): Low–Medium. Extra latency under load; multiple round trips per request.
- Difficulty (update): Low. One aggregate with filtered counts.

5) Centralized multi‑model watermark
- Necessity: Not needed unless you’re chasing every millisecond; architectural change.
- Risk (leave as‑is): Low. Multiple aggregates are acceptable; already scoped for ETag/validators.
- Difficulty (update): High. Requires triggers/signals or a materialized view; coordination and migration overhead.

 
 ## Coverage Notes

This analysis includes all explicit SQL invocations (`cursor.execute`, `psql -c`) and the primary ORM aggregate/grouping queries found under `backend/`. Routine ORM filters (simple `.filter(...)`/`.get(...)`) are numerous and omitted for brevity; they compile to parameterized SQL and typically do not require special tuning. If you want, we can instrument Django to capture exact SQL per endpoint in a staging environment for a complete catalogue.
