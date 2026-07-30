import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-accent-foreground">
          G
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Goodearth Toolbox</h1>
        <p className="mt-1 text-sm text-muted">Sign in with your work email</p>
      </div>
      <LoginForm />
    </Card>
  );
}
