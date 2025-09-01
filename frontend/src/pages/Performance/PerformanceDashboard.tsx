/**
 * Performance Dashboard - Phase 6 Implementation
 * Comprehensive performance monitoring and metrics visualization
 */

import React, { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { 
  getEnhancedPerformanceSummary, 
  getEnhancedPerformanceMetrics, 
  getBudgetViolations,
  PERFORMANCE_BUDGETS,
  trackPerformanceEvent,
  EnhancedPerformanceTimer
} from '@/utils/monitoring';

interface PerformanceMetric {
  metric: string;
  value: number;
  score: 'good' | 'warning' | 'poor';
  exceedsBudget: boolean;
  timestamp: number;
  budgetThreshold: number;
}

interface BudgetViolation {
  metric: string;
  value: number;
  budget: number;
  excess: number;
  timestamp: number;
}

const PerformanceDashboard: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [violations, setViolations] = useState<BudgetViolation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const refreshData = () => {
    const timer = new EnhancedPerformanceTimer('performance_dashboard_refresh');
    
    try {
      setIsLoading(true);
      
      const currentSummary = getEnhancedPerformanceSummary();
      const currentMetrics = getEnhancedPerformanceMetrics();
      const rawViolations = getBudgetViolations();
      const currentViolations = rawViolations.map(violation => ({
        metric: violation.metric,
        value: violation.value,
        budget: PERFORMANCE_BUDGETS[violation.metric].budget,
        excess: violation.value - PERFORMANCE_BUDGETS[violation.metric].budget,
        timestamp: violation.timestamp,
      }));
      
      setSummary(currentSummary);
      setMetrics(currentMetrics);
      setViolations(currentViolations);
      setLastUpdated(new Date());
      
      trackPerformanceEvent('dashboard_refresh', timer.end().duration);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getScoreColor = (score: string) => {
    switch (score) {
      case 'good': return 'text-emerald-400';
      case 'warning': return 'text-amber-400'; 
      case 'poor': return 'text-red-400';
      default: return 'text-[#969696]';
    }
  };

  const getScoreBadgeColor = (score: string) => {
    switch (score) {
      case 'good': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'warning': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'poor': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-[#3e3e42]/20 text-[#969696] border-[#3e3e42]/30';
    }
  };

  const formatValue = (metric: string, value: number) => {
    if (metric === 'CLS') {
      return value.toFixed(3);
    }
    return `${Math.round(value)}ms`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (!summary) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-[#969696]">Loading performance data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#cccccc]">Performance Dashboard</h1>
          <p className="text-[#969696] mt-1">
            Real-time Web Vitals monitoring and budget compliance
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-sm text-[#969696]">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
          <Button
            onClick={refreshData}
            disabled={isLoading}
            className="bg-[#007acc] hover:bg-[#005a99]"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <div className="text-[#969696] text-sm">Total Metrics</div>
          <div className="text-2xl font-bold text-[#cccccc]">{summary.totalMetrics}</div>
          <div className="text-xs text-[#969696] mt-1">Session: {summary.sessionId.slice(-8)}</div>
        </Card>

        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <div className="text-[#969696] text-sm">Budget Compliance</div>
          <div className={`text-2xl font-bold ${summary.budgetCompliance >= 90 ? 'text-emerald-400' : summary.budgetCompliance >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
            {summary.budgetCompliance.toFixed(1)}%
          </div>
          <div className="text-xs text-[#969696] mt-1">
            {summary.budgetViolations} violations
          </div>
        </Card>

        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <div className="text-[#969696] text-sm">Good Performance</div>
          <div className="text-2xl font-bold text-emerald-400">{summary.byScore.good}</div>
          <div className="text-xs text-[#969696] mt-1">Within thresholds</div>
        </Card>

        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <div className="text-[#969696] text-sm">Needs Attention</div>
          <div className="text-2xl font-bold text-red-400">
            {summary.byScore.warning + summary.byScore.poor}
          </div>
          <div className="text-xs text-[#969696] mt-1">Performance issues</div>
        </Card>
      </div>

      {/* Core Web Vitals */}
      <Card className="bg-[#2d2d30] border-[#3e3e42]">
        <h2 className="text-lg font-semibold text-[#cccccc] mb-4">Core Web Vitals</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(PERFORMANCE_BUDGETS).map(([metricName, budget]) => {
            const latestMetric = summary.byMetric[metricName];
            
            return (
              <div key={metricName} className="text-center p-4 bg-[#3e3e42]/50 rounded-lg">
                <div className="text-sm font-medium text-[#cccccc] mb-2">{metricName}</div>
                
                {latestMetric ? (
                  <>
                    <div className={`text-xl font-bold ${getScoreColor(latestMetric.score)}`}>
                      {formatValue(metricName, latestMetric.value)}
                    </div>
                    <div className={`text-xs px-2 py-1 rounded border mt-2 inline-block ${getScoreBadgeColor(latestMetric.score)}`}>
                      {latestMetric.score}
                    </div>
                    <div className="text-xs text-[#969696] mt-1">
                      Budget: {formatValue(metricName, budget.budget)}
                    </div>
                    {latestMetric.exceedsBudget && (
                      <div className="text-xs text-red-400 mt-1">
                        +{formatValue(metricName, latestMetric.value - budget.budget)} over
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[#969696] text-sm">No data</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Budget Violations */}
      {violations.length > 0 && (
        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <h2 className="text-lg font-semibold text-[#cccccc] mb-4">
            🚨 Budget Violations ({violations.length})
          </h2>
          <div className="space-y-3">
            {violations.slice(0, 10).map((violation, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded">
                <div>
                  <div className="font-medium text-red-400">{violation.metric}</div>
                  <div className="text-sm text-[#969696]">
                    {formatTimestamp(violation.timestamp)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-red-400 font-medium">
                    {formatValue(violation.metric, violation.value)}
                  </div>
                  <div className="text-xs text-[#969696]">
                    Budget: {formatValue(violation.metric, violation.budget)}
                  </div>
                  <div className="text-xs text-red-300">
                    +{formatValue(violation.metric, violation.excess)} over
                  </div>
                </div>
              </div>
            ))}
            
            {violations.length > 10 && (
              <div className="text-center text-[#969696] text-sm pt-3">
                ... and {violations.length - 10} more violations
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recent Metrics */}
      <Card className="bg-[#2d2d30] border-[#3e3e42]">
        <h2 className="text-lg font-semibold text-[#cccccc] mb-4">Recent Metrics</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#3e3e42]">
                <th className="text-left py-2 text-[#cccccc]">Metric</th>
                <th className="text-left py-2 text-[#cccccc]">Value</th>
                <th className="text-left py-2 text-[#cccccc]">Score</th>
                <th className="text-left py-2 text-[#cccccc]">Budget Status</th>
                <th className="text-left py-2 text-[#cccccc]">Time</th>
              </tr>
            </thead>
            <tbody>
              {metrics.slice(-20).reverse().map((metric, index) => (
                <tr key={index} className="border-b border-[#3e3e42]/50">
                  <td className="py-2 text-[#cccccc] font-medium">{metric.metric}</td>
                  <td className={`py-2 ${getScoreColor(metric.score)}`}>
                    {formatValue(metric.metric, metric.value)}
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded text-xs ${getScoreBadgeColor(metric.score)}`}>
                      {metric.score}
                    </span>
                  </td>
                  <td className="py-2">
                    {metric.exceedsBudget ? (
                      <span className="text-red-400 text-xs">Over budget</span>
                    ) : (
                      <span className="text-emerald-400 text-xs">Within budget</span>
                    )}
                  </td>
                  <td className="py-2 text-[#969696] text-xs">
                    {formatTimestamp(metric.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default PerformanceDashboard;