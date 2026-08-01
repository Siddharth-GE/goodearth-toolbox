import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="bg-accent text-accent-foreground mb-4 flex size-11 items-center justify-center rounded-2xl text-lg font-bold">
          G
        </span>
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Goodearth Toolbox</h1>
        <p className="text-muted mt-1 text-sm">Sign in with your work email</p>
      </div>
      <LoginForm />
    </Card>
  );
}
