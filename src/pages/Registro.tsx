import { SignUp } from "@clerk/clerk-react";

const Registro = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SignUp
        routing="hash"
        afterSignUpUrl="/seller/dashboard"
        appearance={{
          elements: {
            rootBox: "w-full max-w-md",
            card: "bg-card border border-border shadow-xl rounded-2xl",
            headerTitle: "text-foreground font-display",
            headerSubtitle: "text-muted-foreground",
            formFieldInput: "bg-background border-border text-foreground",
            formButtonPrimary: "bg-primary hover:bg-primary/90",
            footerActionLink: "text-primary hover:text-primary/80",
          },
        }}
      />
    </div>
  );
};

export default Registro;
