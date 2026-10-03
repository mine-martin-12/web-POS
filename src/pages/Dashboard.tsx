import React, { useState, useEffect } from "react";
import { formatMoney } from "@/lib/currency";
import { Money } from "@/components/common/Money";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { DEFAULT_TIME_ZONE, formatLocalDayKey } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { useDashboardMetrics } from "@/features/dashboard/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, subDays } from "date-fns";
import {
  CalendarIcon,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  Target,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { cn } from "@/lib/utils";
import { GrowthIndicator } from "@/components/common/GrowthIndicator";

const Dashboard = () => {
  const { profile, business } = useAuth();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: new Date(), // Set Today as default
    to: new Date(),
  });

  const timeZone = business?.timezone ?? DEFAULT_TIME_ZONE;
  const range = { from: formatLocalDayKey(dateRange.from), to: formatLocalDayKey(dateRange.to) };
  const { metrics, isLoading, error } = useDashboardMetrics(range, timeZone, !!business);

  useEffect(() => {
    if (error) toast.error("Couldn't load the dashboard", { description: getErrorMessage(error) });
  }, [error]);

  const setPreset = (days: number) => {
    const today = new Date();
    // "Last 7 days" = today and the 6 days before it.
    setDateRange({ from: subDays(today, days - 1), to: today });
  };

  const formatCurrency = (amount: number) => formatMoney(amount, business?.currency);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {profile?.first_name}! Here's what's happening with
            your business.
          </p>
        </div>

        {/* Date Range Picker */}
        <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-auto">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(dateRange.from, "MMM dd")} -{" "}
              {format(dateRange.to, "MMM dd")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-card" align="end">
            <div className="p-4">
              <div className="space-y-4">
                <h4 className="font-medium">Select Date Range</h4>
                <div className="grid gap-2">
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => setPreset(1)}
                  >
                    Today
                  </Button>
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() =>
                      setDateRange({
                        from: subDays(new Date(), 7),
                        to: new Date(),
                      })
                    }
                  >
                    Last 7 Days
                  </Button>
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() =>
                      setDateRange({
                        from: subDays(new Date(), 30),
                        to: new Date(),
                      })
                    }
                  >
                    Last 30 Days
                  </Button>
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() =>
                      setDateRange({
                        from: subDays(new Date(), 90),
                        to: new Date(),
                      })
                    }
                  >
                    Last 90 Days
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <h5 className="text-sm font-medium mb-3">
                    Custom Date Range
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange.from ? (
                              format(dateRange.from, "PPP")
                            ) : (
                              <span>Pick start date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange.from}
                            onSelect={(date) =>
                              date &&
                              setDateRange((prev) => ({ ...prev, from: date }))
                            }
                            className={cn("p-3 pointer-events-auto")}
                            disabled={(date) =>
                              date > new Date() || date < new Date("2020-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">End Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange.to ? (
                              format(dateRange.to, "PPP")
                            ) : (
                              <span>Pick end date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange.to}
                            onSelect={(date) =>
                              date &&
                              setDateRange((prev) => ({ ...prev, to: date }))
                            }
                            className={cn("p-3 pointer-events-auto")}
                            disabled={(date) =>
                              date > new Date() || date < dateRange.from
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button 
                      onClick={() => setRangeOpen(false)}
                      className="w-full"
                    >
                      Apply Date Range
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 lg:gap-6">
        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Actual Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-success shrink-0" />
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-bold text-foreground mb-1">
              <Money value={metrics?.actualRevenue ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground">
              From {metrics?.paidSalesCount || 0} paid sales
            </p>
            {metrics && (
              <GrowthIndicator 
                growth={metrics.actualRevenueGrowth} 
                comparisonLabel={metrics.comparisonPeriodLabel}
              />
            )}
          </CardContent>
        </Card>

        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Revenue
            </CardTitle>
            <Package className="h-4 w-4 text-warning shrink-0" />
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-bold text-foreground mb-1">
              <Money value={metrics?.pendingRevenue ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground">
              From {metrics?.creditSalesCount || 0} credit sales
            </p>
            {metrics && (
              <GrowthIndicator 
                growth={metrics.pendingRevenueGrowth} 
                comparisonLabel={metrics.comparisonPeriodLabel}
              />
            )}
          </CardContent>
        </Card>

        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sales
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-bold text-foreground mb-1">
              <Money value={metrics?.totalSalesAmount ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics?.totalSalesCount || 0} total transactions
            </p>
            {metrics && (
              <GrowthIndicator 
                growth={metrics.totalSalesAmountGrowth} 
                comparisonLabel={metrics.comparisonPeriodLabel}
              />
            )}
          </CardContent>
        </Card>

        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Actual Profit
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-success shrink-0" />
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-bold text-foreground mb-1">
              <Money value={metrics?.actualProfit ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground">Cash flow profit</p>
            {metrics && (
              <GrowthIndicator 
                growth={metrics.actualProfitGrowth} 
                comparisonLabel={metrics.comparisonPeriodLabel}
              />
            )}
          </CardContent>
        </Card>

        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Profit
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-warning shrink-0" />
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-bold text-foreground mb-1">
              <Money value={metrics?.pendingProfit ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground">From credit sales</p>
            {metrics && (
              <GrowthIndicator 
                growth={metrics.pendingProfitGrowth} 
                comparisonLabel={metrics.comparisonPeriodLabel}
              />
            )}
          </CardContent>
        </Card>

        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Sale
            </CardTitle>
            <Target className="h-4 w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-bold text-foreground mb-1">
              <Money value={metrics?.averageSale ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground">Per transaction</p>
            {metrics && (
              <GrowthIndicator 
                growth={metrics.averageSaleGrowth} 
                comparisonLabel={metrics.comparisonPeriodLabel}
              />
            )}
          </CardContent>
        </Card>

      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Revenue & Profit Over Time</CardTitle>
            <p className="text-sm text-muted-foreground">
              Solid lines show actual revenue/profit, dotted lines show total including pending
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics?.salesChart || []}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      name === "actualSales" ? "Actual Revenue" : 
                      name === "actualProfit" ? "Actual Profit" :
                      name === "sales" ? "Total Sales" : "Total Profit",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualSales"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualProfit"
                    stroke="hsl(var(--accent))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--accent))", strokeWidth: 2, r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    stroke="hsl(var(--accent))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: "hsl(var(--accent))", strokeWidth: 2, r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Top 10 Products by Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics?.topProducts.slice(0, 5) || []}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    formatter={(value) => [
                      formatCurrency(Number(value)),
                      "Total Sales",
                    ]}
                  />
                  <Bar
                    dataKey="totalSales"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Top 10 Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics?.topProducts.slice(0, 10).map((product, index) => (
                <div
                  key={product.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {product.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {product.quantity} sold
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">
                      <Money value={product.totalSales} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Bottom 10 Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics?.bottomProducts.slice(0, 10).map((product, index) => (
                <div
                  key={product.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {product.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {product.quantity} sold
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">
                      <Money value={product.totalSales} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
