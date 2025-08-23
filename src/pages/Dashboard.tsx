import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
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

interface DashboardMetrics {
  totalSalesAmount: number;
  totalSalesCount: number;
  totalProfit: number;
  averageSale: number;
  salesGrowth: number;
  topProducts: Array<{ name: string; totalSales: number; quantity: number }>;
  bottomProducts: Array<{ name: string; totalSales: number; quantity: number }>;
  salesChart: Array<{ date: string; sales: number; profit: number }>;
}

const Dashboard = () => {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: new Date(), // Set Today as default
    to: new Date(),
  });

  const fetchDashboardData = async () => {
    if (!profile?.business_id) return;

    setIsLoading(true);
    try {
      const fromDate = startOfDay(dateRange.from);
      const toDate = endOfDay(dateRange.to);

      // Fetch sales data for the selected period
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select(
          `
          id,
          quantity,
          selling_price,
          total_price,
          sale_date,
          products (
            id,
            name,
            buying_price
          )
        `
        )
        .eq("business_id", profile.business_id)
        .gte("sale_date", fromDate.toISOString())
        .lte("sale_date", toDate.toISOString())
        .order("sale_date", { ascending: true });

      if (salesError) throw salesError;

      // Calculate metrics
      const totalSalesAmount =
        salesData?.reduce((sum, sale) => sum + Number(sale.total_price), 0) ||
        0;
      const totalSalesCount = salesData?.length || 0;

      // Calculate profit
      const totalProfit =
        salesData?.reduce((sum, sale) => {
          const buyingPrice = Number(sale.products?.buying_price) || 0;
          const sellingPrice = Number(sale.selling_price) || 0;
          const quantity = Number(sale.quantity) || 0;
          const profitPerUnit = sellingPrice - buyingPrice;
          return sum + profitPerUnit * quantity;
        }, 0) || 0;

      const averageSale =
        totalSalesCount > 0 ? totalSalesAmount / totalSalesCount : 0;

      // Calculate sales growth (compare with previous period)
      const periodLength = Math.ceil(
        (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const prevFromDate = subDays(fromDate, periodLength);
      const prevToDate = subDays(toDate, periodLength);

      const { data: prevSalesData } = await supabase
        .from("sales")
        .select("total_price")
        .eq("business_id", profile.business_id)
        .gte("sale_date", prevFromDate.toISOString())
        .lte("sale_date", prevToDate.toISOString());

      const prevTotalSales =
        prevSalesData?.reduce(
          (sum, sale) => sum + Number(sale.total_price),
          0
        ) || 0;
      const salesGrowth =
        prevTotalSales > 0
          ? ((totalSalesAmount - prevTotalSales) / prevTotalSales) * 100
          : 0;

      // Top and bottom products
      const productSales =
        salesData?.reduce((acc, sale) => {
          const productName = sale.products?.name || "Unknown Product";
          if (!acc[productName]) {
            acc[productName] = { totalSales: 0, quantity: 0 };
          }
          acc[productName].totalSales += Number(sale.total_price);
          acc[productName].quantity += Number(sale.quantity);
          return acc;
        }, {} as Record<string, { totalSales: number; quantity: number }>) ||
        {};

      const sortedProducts = Object.entries(productSales)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.totalSales - a.totalSales);

      const topProducts = sortedProducts.slice(0, 10);
      const bottomProducts = sortedProducts.slice(-10).reverse();

      // Sales chart data (group by day)
      const salesByDate =
        salesData?.reduce((acc, sale) => {
          const date = format(new Date(sale.sale_date), "yyyy-MM-dd");
          if (!acc[date]) {
            acc[date] = { sales: 0, profit: 0 };
          }
          acc[date].sales += Number(sale.total_price);

          const buyingPrice = Number(sale.products?.buying_price) || 0;
          const sellingPrice = Number(sale.selling_price) || 0;
          const quantity = Number(sale.quantity) || 0;
          const profitPerUnit = sellingPrice - buyingPrice;
          acc[date].profit += profitPerUnit * quantity;

          return acc;
        }, {} as Record<string, { sales: number; profit: number }>) || {};

      const salesChart = Object.entries(salesByDate)
        .map(([date, data]) => ({
          date: format(new Date(date), "MMM dd"),
          ...data,
        }))
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

      setMetrics({
        totalSalesAmount,
        totalSalesCount,
        totalProfit,
        averageSale,
        salesGrowth,
        topProducts,
        bottomProducts,
        salesChart,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [profile?.business_id, dateRange]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "KES",
    }).format(amount);
  };

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
        <Popover>
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
                    onClick={() =>
                      setDateRange({
                        from: new Date(),
                        to: new Date(),
                      })
                    }
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
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sales
            </CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {metrics ? formatCurrency(metrics.totalSalesAmount) : "KES 0.00"}
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sales Count
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {metrics?.totalSalesCount || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Profit
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {metrics ? formatCurrency(metrics.totalProfit) : "$0.00"}
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Sale
            </CardTitle>
            <Target className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {metrics ? formatCurrency(metrics.averageSale) : "$0.00"}
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sales Growth
            </CardTitle>
            <TrendingUp
              className={cn(
                "h-4 w-4",
                metrics && metrics.salesGrowth >= 0
                  ? "text-success"
                  : "text-destructive"
              )}
            />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold",
                metrics && metrics.salesGrowth >= 0
                  ? "text-success"
                  : "text-destructive"
              )}
            >
              {metrics ? `${metrics.salesGrowth.toFixed(1)}%` : "0%"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Sales & Profit Over Time</CardTitle>
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
                    formatter={(value: any, name: string) => [
                      formatCurrency(Number(value)),
                      name === "sales" ? "Sales" : "Profit",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--success))", strokeWidth: 2, r: 4 }}
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
                    formatter={(value: any) => [
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
                      {formatCurrency(product.totalSales)}
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
                      {formatCurrency(product.totalSales)}
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
