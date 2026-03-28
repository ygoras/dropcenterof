import { SignIn } from "@clerk/clerk-react";

const Login = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SignIn
        routing="hash"
        afterSignInUrl="/dashboard"
        appearance={{
          elements: {
            rootBox: "w-full max-w-md",
            card: "bg-card border border-border shadow-xl rounded-2xl",
            headerTitle: "text-foreground font-display",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton: "border-border text-foreground hover:bg-secondary",
            formFieldInput: "bg-background border-border text-foreground",
            formButtonPrimary: "bg-primary hover:bg-primary/90",
            footerActionLink: "text-primary hover:text-primary/80",
          },
        }}
      />
    </div>
  );
};

export default Login;
