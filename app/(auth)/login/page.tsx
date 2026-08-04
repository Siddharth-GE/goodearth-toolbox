import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo className="mb-4 size-11" />
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Goodearth Toolbox</h1>
        <p className="text-muted mt-1 text-sm">Sign in with your work email</p>
      </div>
      <LoginForm />
    </Card>
  );
}
