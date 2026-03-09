import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50" data-testid="page-not-found">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-title">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600" data-testid="text-description">
            Sorry, the page you're looking for doesn't exist.
          </p>

          <Link
            href="/"
            className="inline-block mt-4 text-sm text-emerald-600 hover:text-emerald-500 font-medium transition-colors"
            data-testid="link-go-home"
          >
            ← Go Home
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
