SELECT
  COALESCE(blocked.pid, 0) AS blocked_pid,
  COALESCE(blocking.pid, 0) AS blocking_pid,
  COALESCE(blocked.usename, '') AS blocked_user,
  COALESCE(blocking.usename, '') AS blocking_user,
  COALESCE(blocked.wait_event_type, '') AS blocked_wait_type,
  COALESCE(blocked.wait_event, '') AS blocked_wait_event,
  LEFT(COALESCE(blocked.query, ''), 180) AS blocked_query_sample,
  LEFT(COALESCE(blocking.query, ''), 180) AS blocking_query_sample
FROM pg_locks bl
JOIN pg_stat_activity blocked ON blocked.pid = bl.pid
JOIN pg_locks kl
  ON bl.locktype = kl.locktype
 AND bl.database IS NOT DISTINCT FROM kl.database
 AND bl.relation IS NOT DISTINCT FROM kl.relation
 AND bl.page IS NOT DISTINCT FROM kl.page
 AND bl.tuple IS NOT DISTINCT FROM kl.tuple
 AND bl.virtualxid IS NOT DISTINCT FROM kl.virtualxid
 AND bl.transactionid IS NOT DISTINCT FROM kl.transactionid
 AND bl.classid IS NOT DISTINCT FROM kl.classid
 AND bl.objid IS NOT DISTINCT FROM kl.objid
 AND bl.objsubid IS NOT DISTINCT FROM kl.objsubid
 AND kl.granted
JOIN pg_stat_activity blocking ON blocking.pid = kl.pid
WHERE NOT bl.granted
ORDER BY blocked.query_start NULLS LAST;
