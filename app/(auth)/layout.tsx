export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen flex-1 items-center justify-center px-4">
      {children}
    </div>
  );
}
