import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: 'var(--lab-bg)' }}>
      <Card
        className="w-full max-w-lg mx-4 shadow-lg backdrop-blur-sm"
        style={{
          background: 'var(--lab-panel-bg)',
          border: '1px solid var(--lab-panel-border)',
        }}
      >
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-red-500" />
            </div>
          </div>

          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--lab-text)' }}>404</h1>

          <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--lab-text-muted)' }}>
            Page Not Found
          </h2>

          <p className="mb-8 leading-relaxed" style={{ color: 'var(--lab-text-muted)' }}>
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={handleGoHome}
              className="px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
              style={{
                background: 'var(--lab-primary-soft)',
                border: '1px solid var(--lab-panel-border)',
                color: 'var(--lab-primary-text)',
              }}
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
