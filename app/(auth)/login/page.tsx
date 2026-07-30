import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Goodearth Toolbox</h1>
        <p className="mt-1 text-sm text-muted">Sign in with your work email</p>
      </div>
      <LoginForm />
    </Card>
  );
}
