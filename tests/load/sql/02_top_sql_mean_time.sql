SELECT
  queryid,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
  ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
  rows,
  LEFT(query, 200) AS query_sample
FROM pg_stat_statements
WHERE calls >= 5
ORDER BY mean_exec_time DESC
LIMIT 30;
