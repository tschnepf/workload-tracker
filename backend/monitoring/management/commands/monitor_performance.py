"""
Django management command for performance monitoring and database maintenance
Phase 6 Implementation
"""

from django.core.management.base import BaseCommand
from django.db import connection
from django.conf import settings
from django.utils import timezone
from django.core.cache import cache
import logging
import time
import psutil
import os

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Monitor application performance and database health'

    def add_arguments(self, parser):
        parser.add_argument(
            '--check-db-bloat',
            action='store_true',
            help='Check database table bloat',
        )
        parser.add_argument(
            '--vacuum-analyze',
            action='store_true', 
            help='Run VACUUM ANALYZE on database',
        )
        parser.add_argument(
            '--monitor-queries',
            action='store_true',
            help='Monitor slow queries and N+1 issues',
        )
        parser.add_argument(
            '--system-metrics',
            action='store_true',
            help='Collect system performance metrics',
        )
        parser.add_argument(
            '--duration',
            type=int,
            default=60,
            help='Monitoring duration in seconds (default: 60)',
        )

    def handle(self, *args, **options):
        """Main command handler"""
        self.stdout.write(
            self.style.SUCCESS('🔍 Starting performance monitoring...')
        )
        
        if options['check_db_bloat']:
            self.check_database_bloat()
            
        if options['vacuum_analyze']:
            self.vacuum_analyze_database()
            
        if options['monitor_queries']:
            self.monitor_slow_queries(options['duration'])
            
        if options['system_metrics']:
            self.collect_system_metrics(options['duration'])
            
        # If no specific options, run basic health check
        if not any([
            options['check_db_bloat'],
            options['vacuum_analyze'], 
            options['monitor_queries'],
            options['system_metrics']
        ]):
            self.basic_health_check()

    def check_database_bloat(self):
        """Check for database table and index bloat"""
        self.stdout.write('📊 Checking database bloat...')
        
        bloat_query = """
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
        """
        
        try:
            with connection.cursor() as cursor:
                cursor.execute(bloat_query)
                results = cursor.fetchall()
                
                if results:
                    self.stdout.write('\n📋 Database Bloat Report:')
                    self.stdout.write('-' * 80)
                    self.stdout.write(f"{'Table':<20} {'Size':<15} {'Bloat':<15} {'Bloat %':<10}")
                    self.stdout.write('-' * 80)
                    
                    high_bloat_tables = []
                    
                    for row in results:
                        schema, table, size, bloat, pct = row
                        color = self.style.ERROR if pct > 20 else self.style.WARNING if pct > 10 else self.style.SUCCESS
                        self.stdout.write(color(f"{table:<20} {size:<15} {bloat:<15} {pct:<10}%"))
                        
                        if pct > 20:
                            high_bloat_tables.append(table)
                    
                    if high_bloat_tables:
                        self.stdout.write(
                            self.style.ERROR(f'\n⚠️ High bloat detected in tables: {", ".join(high_bloat_tables)}')
                        )
                        self.stdout.write('Consider running VACUUM FULL on these tables during maintenance window.')
                        
                else:
                    self.stdout.write(self.style.SUCCESS('✅ No significant bloat detected'))
                    
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Error checking bloat: {e}'))

    def vacuum_analyze_database(self):
        """Run VACUUM ANALYZE on all tables"""
        self.stdout.write('🧹 Running VACUUM ANALYZE...')
        
        # Get all tables in public schema
        table_query = """
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename;
        """
        
        try:
            with connection.cursor() as cursor:
                cursor.execute(table_query)
                tables = [row[0] for row in cursor.fetchall()]
                
                for table in tables:
                    self.stdout.write(f'  Processing {table}...', ending='')
                    start_time = time.time()
                    
                    cursor.execute(f'VACUUM ANALYZE "{table}";')
                    
                    duration = time.time() - start_time
                    self.stdout.write(self.style.SUCCESS(f' ✅ ({duration:.2f}s)'))
                    
                self.stdout.write(
                    self.style.SUCCESS(f'✅ VACUUM ANALYZE completed for {len(tables)} tables')
                )
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Error during VACUUM ANALYZE: {e}'))

    def monitor_slow_queries(self, duration):
        """Monitor for slow queries and potential N+1 issues"""
        self.stdout.write(f'⏱️ Monitoring slow queries for {duration} seconds...')
        
        # Enable query logging temporarily if not already enabled
        slow_query_threshold = 1000  # 1 second in milliseconds
        
        from django.db import reset_queries
        from django import db
        
        # Clear existing query log
        reset_queries()
        
        # Monitor for the specified duration
        start_time = time.time()
        query_counts = {}
        slow_queries = []
        
        original_debug = settings.DEBUG
        settings.DEBUG = True  # Enable query logging
        
        try:
            while time.time() - start_time < duration:
                time.sleep(1)
                
                # Analyze current queries
                for query in db.connection.queries:
                    query_time = float(query['time']) * 1000  # Convert to milliseconds
                    
                    if query_time > slow_query_threshold:
                        slow_queries.append({
                            'sql': query['sql'][:200] + '...' if len(query['sql']) > 200 else query['sql'],
                            'time': query_time
                        })
                    
                    # Check for potential N+1 patterns
                    sql = query['sql'].strip().upper()
                    if sql.startswith('SELECT') and 'WHERE' in sql:
                        # Simple heuristic for detecting repeated similar queries
                        pattern = sql.split('WHERE')[0]
                        query_counts[pattern] = query_counts.get(pattern, 0) + 1
                
                reset_queries()
            
            # Report findings
            if slow_queries:
                self.stdout.write(f'\n🐌 Found {len(slow_queries)} slow queries:')
                for i, query in enumerate(slow_queries[:10], 1):  # Show top 10
                    self.stdout.write(
                        self.style.WARNING(f"{i}. {query['time']:.2f}ms: {query['sql']}")
                    )
            
            # Check for potential N+1 issues
            potential_n1 = {k: v for k, v in query_counts.items() if v > 5}
            if potential_n1:
                self.stdout.write(f'\n🔄 Potential N+1 query patterns detected:')
                for pattern, count in potential_n1.items():
                    self.stdout.write(
                        self.style.ERROR(f"  {count}x: {pattern[:100]}...")
                    )
            
            if not slow_queries and not potential_n1:
                self.stdout.write(self.style.SUCCESS('✅ No performance issues detected'))
        
        finally:
            settings.DEBUG = original_debug

    def collect_system_metrics(self, duration):
        """Collect system performance metrics"""
        self.stdout.write(f'📊 Collecting system metrics for {duration} seconds...')
        
        start_time = time.time()
        metrics = {
            'cpu_percent': [],
            'memory_percent': [],
            'memory_used_mb': [],
            'disk_io_read': [],
            'disk_io_write': [],
        }
        
        # Get initial disk I/O counters
        disk_io_start = psutil.disk_io_counters()
        
        while time.time() - start_time < duration:
            # CPU and Memory
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            
            metrics['cpu_percent'].append(cpu_percent)
            metrics['memory_percent'].append(memory.percent)
            metrics['memory_used_mb'].append(memory.used / 1024 / 1024)
            
            # Disk I/O
            disk_io = psutil.disk_io_counters()
            if disk_io_start:
                metrics['disk_io_read'].append(disk_io.read_bytes - disk_io_start.read_bytes)
                metrics['disk_io_write'].append(disk_io.write_bytes - disk_io_start.write_bytes)
        
        # Calculate and display averages
        self.stdout.write('\n📈 System Metrics Summary:')
        self.stdout.write('-' * 50)
        
        if metrics['cpu_percent']:
            avg_cpu = sum(metrics['cpu_percent']) / len(metrics['cpu_percent'])
            max_cpu = max(metrics['cpu_percent'])
            
            cpu_color = (self.style.ERROR if avg_cpu > 80 else 
                        self.style.WARNING if avg_cpu > 60 else 
                        self.style.SUCCESS)
            
            self.stdout.write(cpu_color(f"CPU Usage: {avg_cpu:.1f}% avg, {max_cpu:.1f}% max"))
        
        if metrics['memory_percent']:
            avg_mem = sum(metrics['memory_percent']) / len(metrics['memory_percent'])
            max_mem = max(metrics['memory_percent'])
            
            mem_color = (self.style.ERROR if avg_mem > 90 else 
                        self.style.WARNING if avg_mem > 80 else 
                        self.style.SUCCESS)
            
            self.stdout.write(mem_color(f"Memory Usage: {avg_mem:.1f}% avg, {max_mem:.1f}% max"))
        
        if metrics['memory_used_mb']:
            avg_used = sum(metrics['memory_used_mb']) / len(metrics['memory_used_mb'])
            self.stdout.write(f"Memory Used: {avg_used:.0f} MB avg")
        
        # Database connection count
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT count(*) FROM pg_stat_activity 
                    WHERE state = 'active' AND pid != pg_backend_pid();
                """)
                active_connections = cursor.fetchone()[0]
                self.stdout.write(f"Active DB Connections: {active_connections}")
        except Exception:
            pass

    def basic_health_check(self):
        """Run basic application health checks"""
        self.stdout.write('🏥 Running basic health check...')
        
        checks = [
            ('Database Connection', self.check_database_connection),
            ('Cache System', self.check_cache_system),
            ('Disk Space', self.check_disk_space),
            ('Memory Usage', self.check_memory_usage),
        ]
        
        all_passed = True
        
        for check_name, check_func in checks:
            try:
                result = check_func()
                if result['status'] == 'ok':
                    self.stdout.write(
                        self.style.SUCCESS(f"✅ {check_name}: {result['message']}")
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING(f"⚠️ {check_name}: {result['message']}")
                    )
                    all_passed = False
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"❌ {check_name}: Error - {e}")
                )
                all_passed = False
        
        if all_passed:
            self.stdout.write(
                self.style.SUCCESS('\n🎉 All health checks passed!')
            )
        else:
            self.stdout.write(
                self.style.WARNING('\n⚠️ Some health checks require attention.')
            )

    def check_database_connection(self):
        """Check database connectivity and response time"""
        start_time = time.time()
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1;')
            cursor.fetchone()
        response_time = (time.time() - start_time) * 1000
        
        if response_time > 1000:  # 1 second
            return {
                'status': 'warning',
                'message': f'Slow response ({response_time:.1f}ms)'
            }
        
        return {
            'status': 'ok',
            'message': f'Connected ({response_time:.1f}ms)'
        }

    def check_cache_system(self):
        """Check cache system functionality"""
        test_key = 'health_check_test'
        test_value = str(time.time())
        
        cache.set(test_key, test_value, 30)
        cached_value = cache.get(test_key)
        
        if cached_value == test_value:
            return {'status': 'ok', 'message': 'Cache working'}
        else:
            return {'status': 'warning', 'message': 'Cache not responding'}

    def check_disk_space(self):
        """Check available disk space"""
        disk_usage = psutil.disk_usage('/')
        free_percent = (disk_usage.free / disk_usage.total) * 100
        
        if free_percent < 10:
            return {
                'status': 'warning',
                'message': f'Low disk space ({free_percent:.1f}% free)'
            }
        
        return {
            'status': 'ok',
            'message': f'{free_percent:.1f}% free space'
        }

    def check_memory_usage(self):
        """Check system memory usage"""
        memory = psutil.virtual_memory()
        
        if memory.percent > 90:
            return {
                'status': 'warning', 
                'message': f'High memory usage ({memory.percent:.1f}%)'
            }
        
        return {
            'status': 'ok',
            'message': f'{memory.percent:.1f}% used'
        }