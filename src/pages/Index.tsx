import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Building2, ArrowRight, TrendingUp, ShoppingCart, Users } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="container mx-auto px-6 py-16 lg:py-24">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-primary rounded-3xl mb-8 shadow-glow animate-scale-in">
              <Building2 className="h-10 w-10 text-white" />
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-bold text-foreground mb-6 animate-fade-in-up">
              Smart POS
              <span className="block bg-gradient-primary bg-clip-text text-transparent">
                Management System
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-fade-in-up">
              Streamline your business operations with our modern, comprehensive POS management system. 
              Track sales, manage inventory, and grow your business with powerful analytics.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up">
              <Button asChild size="lg" className="btn-gradient-primary text-lg px-8 py-6">
                <Link to="/auth">
                  Get Started <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6">
                <Link to="/auth">
                  Sign In
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 lg:py-24">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
              Everything you need to manage your business
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our comprehensive POS system provides all the tools you need to run your business efficiently.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card-elevated hover-lift p-8 text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-4">
                Real-time Analytics
              </h3>
              <p className="text-muted-foreground">
                Track your sales performance with comprehensive analytics and insights to grow your business.
              </p>
            </div>

            <div className="card-elevated hover-lift p-8 text-center">
              <div className="w-16 h-16 bg-gradient-success rounded-2xl flex items-center justify-center mx-auto mb-6">
                <ShoppingCart className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-4">
                Inventory Management
              </h3>
              <p className="text-muted-foreground">
                Keep track of your products, stock levels, and automatically calculate profits and losses.
              </p>
            </div>

            <div className="card-elevated hover-lift p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-accent to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Users className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-4">
                Team Management
              </h3>
              <p className="text-muted-foreground">
                Manage user roles and permissions with admin controls for complete business oversight.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16 lg:py-24 bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Ready to transform your business?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of businesses already using Smart POS to streamline their operations and boost profits.
          </p>
          <Button asChild size="lg" className="btn-gradient-primary text-lg px-8 py-6">
            <Link to="/auth">
              Start Your Free Trial <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
