SELECT
  queryid,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
  ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
  rows,
  LEFT(query, 200) AS query_sample
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 30;
